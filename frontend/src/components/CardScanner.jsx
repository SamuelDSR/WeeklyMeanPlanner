import { useEffect, useRef, useState } from 'react';
import { X, Camera, Image as ImageIcon, Loader2, ScanLine, Flashlight } from 'lucide-react';
import { detectFromSource, detectFromFile, cameraAvailable, nativeCoversAll } from '../lib/barcodeScan';
import { useI18n } from '../i18n';

// 对着卡扫一下，把号码读出来 —— 比照着 13 位数字手输可靠得多。
//
// 扫到就立刻返回，不做「确认」这一步：扫码本来就是为了快，
// 结果会填回表单里，用户在那儿还能改。
export default function CardScanner({ onDetected, onClose }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const doneRef = useRef(false);
  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const [error, setError] = useState('');
  const [decodingFile, setDecodingFile] = useState(false);
  const [resolution, setResolution] = useState('');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [tried, setTried] = useState(0); // 试了多少帧，久了就给别的出路
  const [usingFallback, setUsingFallback] = useState(false);

  // 原生检测器认不认得全我们要的格式。认不全就会去下 1 MB 的 wasm，
  // 提前在界面上说一声（第一次扫会多等几秒）。
  useEffect(() => {
    let cancelled = false;
    nativeCoversAll().then((ok) => {
      if (!cancelled) setUsingFallback(!ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!cameraAvailable()) {
        // 明文 http 下 getUserMedia 压根不存在，说清楚原因，别让人以为是权限问题
        setStatus('error');
        setError(t('scan.noCamera'));
        return;
      }
      try {
        // 分辨率必须往高了要。默认给的常是 640x480 —— 一维码勉强够，
        // PDF417 是堆叠式的、行很密，那个分辨率下根本解不出来。
        // 用 ideal 而不是 exact：给不了就降级，不至于直接开不了相机。
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // 后置摄像头
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // 卡拿在手里离镜头很近，连续对焦能省掉手动等对焦
            advanced: [{ focusMode: 'continuous' }],
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tk) => tk.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings?.() || {};
        if (!cancelled) {
          setResolution(settings.width && settings.height ? `${settings.width}×${settings.height}` : '');
          // 有些设备支持补光。光线不足是扫不出来的头号原因，尤其是 PDF417。
          setHasTorch(!!track?.getCapabilities?.().torch);
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true'); // iOS 上不加会强制全屏播放
        await video.play();
        if (!cancelled) {
          setStatus('scanning');
          loop();
        }
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(
          e?.name === 'NotAllowedError' ? t('scan.denied')
          : e?.name === 'NotFoundError' ? t('scan.noDevice')
          : e?.message || t('scan.failed')
        );
      }
    }

    // 解码循环。
    //
    // 关键是**同一时刻只解一帧**：wasm 在手机上解一帧要几百毫秒，
    // 而循环每 160ms 就触发一次 —— 没有在途锁的话请求会越堆越多，
    // 手机直接卡死，表现就是「怎么扫都没反应」。
    // 桌面上原生解码只要 1ms 左右，所以这个问题在电脑上根本看不出来。
    let busy = false;
    let last = 0;
    async function loop(now = 0) {
      if (cancelled || doneRef.current) return;
      rafRef.current = requestAnimationFrame(loop);
      if (busy || now - last < 120) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      busy = true;
      last = now;
      try {
        const hit = await detectFromSource(video);
        if (hit && !doneRef.current && !cancelled) {
          doneRef.current = true;
          // 扫到了震一下，眼睛不用一直盯着屏幕
          navigator.vibrate?.(60);
          onDetected(hit);
          return;
        }
        if (!cancelled) setTried((n) => n + 1);
      } catch {
        // 单帧解码失败很常见（模糊、反光），继续下一帧就行
      } finally {
        busy = false;
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((tk) => tk.stop());
    };
  }, []);

  // 补光。光线不足是扫不出来的头号原因，PDF417 尤其吃亏 ——
  // 它的行比一维码密得多，暗一点就糊成一片。
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // 有些设备报告支持却用不了，静默忽略
      setHasTorch(false);
    }
  }

  // 从相册选一张。相机用不了的时候这是唯一的退路，
  // 明文 http 下也能用（读文件不需要安全上下文）。
  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDecodingFile(true);
    setError('');
    try {
      const hit = await detectFromFile(file);
      if (hit) {
        doneRef.current = true;
        onDetected(hit);
      } else {
        setError(t('scan.notFoundInImage'));
      }
    } catch (e) {
      setError(e.message || t('scan.failed'));
    } finally {
      setDecodingFile(false);
      event.target.value = '';
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-ink flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 pt-safe">
        <span className="text-porcelain font-display font-medium text-sm">{t('scan.title')}</span>
        <div className="flex items-center gap-1">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 ${torchOn ? 'text-wheat' : 'text-porcelain/70'}`}
              aria-label={t('scan.torch')}
            >
              <Flashlight size={20} />
            </button>
          )}
          <button onClick={onClose} className="p-2.5 text-porcelain/70" aria-label={t('common.close')}>
            <X size={22} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* 取景框：把卡上的条码对进这个横条里 */}
        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[85%] h-28 border-2 border-porcelain/80 rounded-xl relative">
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-persimmon/80 animate-pulse" />
            </div>
          </div>
        )}

        {status === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-porcelain/70">
            <Loader2 size={26} className="animate-spin" />
            <p className="text-sm">{t('scan.starting')}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <Camera size={30} className="text-porcelain/40" />
            <p className="text-porcelain/80 text-sm leading-relaxed">{error}</p>
          </div>
        )}
      </div>

      <div className="px-4 py-3 pb-safe space-y-2">
        {status === 'scanning' && (
          <p className="text-porcelain/60 text-xs text-center flex items-center justify-center gap-1.5">
            <ScanLine size={13} /> {t('scan.hint')}
          </p>
        )}
        {error && status !== 'error' && (
          <p className="text-persimmon text-xs text-center">{error}</p>
        )}

        {/* 相机不行就从相册选一张 —— 卡的照片很多人本来就存着 */}
        <label className="w-full py-2.5 rounded-lg border border-porcelain/30 text-porcelain
                          flex items-center justify-center gap-2 text-sm cursor-pointer">
          {decodingFile ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
          {decodingFile ? t('scan.decoding') : t('scan.fromPhoto')}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>

        {/* 扫了一阵还没成的话，说说该怎么办 ——
            PDF417 行密，得靠近、拍满、光要足 */}
        {status === 'scanning' && tried > 25 && (
          <p className="text-wheat/90 text-[11px] text-center leading-relaxed">
            {t('scan.stuckHint')}
          </p>
        )}
        {usingFallback && (
          <p className="text-porcelain/35 text-[11px] text-center">{t('scan.usingFallback')}</p>
        )}
        {/* 排查用：分辨率给得太低是扫不出 PDF417 的头号原因 */}
        {resolution && (
          <p className="text-porcelain/25 text-[10px] text-center font-mono">
            {resolution}{usingFallback ? ' · zxing' : ' · native'}
          </p>
        )}
      </div>
    </div>
  );
}
