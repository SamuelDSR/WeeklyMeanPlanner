import { useEffect, useState } from 'react';
import { X, RotateCw, Sun } from 'lucide-react';
import BarcodeView from './BarcodeView';
import { useI18n } from '../i18n';

// 给扫码枪看的全屏视图。
//
// 收银台那几秒钟决定这个功能有没有用，所以：
//   - 纯白底 + 纯黑码：扫码枪靠反差识别，主题色只会降低成功率
//   - 尽量大：一维码横过来铺满屏幕，比竖着放大一倍还多
//   - 屏幕别灭：Wake Lock 顶住，不然读到一半黑屏
//   - 手动横屏按钮：手机大多锁了竖屏，不能指望它自己转
export default function CardScanView({ card, onClose }) {
  const { t } = useI18n();
  const [landscape, setLandscape] = useState(card.codeFormat !== 'QR');
  const [wakeLockOn, setWakeLockOn] = useState(false);

  // 保持屏幕常亮。只有 https / localhost 下才有这个 API，没有就算了 ——
  // 顶多是屏幕会按系统设置自己灭掉。
  useEffect(() => {
    let lock = null;
    let released = false;
    (async () => {
      try {
        if ('wakeLock' in navigator) {
          lock = await navigator.wakeLock.request('screen');
          if (!released) setWakeLockOn(true);
        }
      } catch {
        // 被拒绝或者不支持，静默降级
      }
    })();
    return () => {
      released = true;
      lock?.release?.().catch(() => {});
    };
  }, []);

  // 全屏时按 Esc 退出
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isQr = card.codeFormat === 'QR';

  return (
    // 白底铺满，盖住 App 自己的配色
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        <span className="font-display font-bold text-ink truncate">{card.name}</span>
        <div className="flex items-center gap-1">
          {wakeLockOn && (
            <span
              className="text-[10px] text-ink/35 flex items-center gap-0.5 mr-1"
              title={t('cards.screenOn')}
            >
              <Sun size={12} /> {t('cards.screenOn')}
            </span>
          )}
          {!isQr && (
            <button
              type="button"
              onClick={() => setLandscape((v) => !v)}
              className="p-2.5 text-ink/50"
              aria-label={t('cards.rotate')}
              title={t('cards.rotate')}
            >
              <RotateCw size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 text-ink/60"
            aria-label={t('common.close')}
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/* 码本体：横屏模式下旋转 90 度，长度能翻一倍多 */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-2 pb-4">
        <div
          className={landscape && !isQr ? 'origin-center' : 'w-full'}
          style={
            landscape && !isQr
              ? { transform: 'rotate(90deg)', width: '78vh', maxWidth: '78vh' }
              : undefined
          }
        >
          <BarcodeView code={card.code} format={card.codeFormat} height={isQr ? 0 : 150} />
        </div>
      </div>

      {card.note && (
        <p className="text-center text-xs text-ink/40 pb-3 px-4 shrink-0">{card.note}</p>
      )}
      {/* 实拍照片：码印糊了扫不出来时给收银员看 */}
      {card.photoURL && (
        <div className="shrink-0 px-4 pb-4 flex justify-center">
          <img
            src={card.thumbURL || card.photoURL}
            alt={card.name}
            className="max-h-24 rounded-lg border border-mist"
          />
        </div>
      )}
    </div>
  );
}
