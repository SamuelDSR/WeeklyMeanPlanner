import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

// 把卡号画成条码 / 二维码。
//
// 全在浏览器里画，不走服务端：装成 App 之后没网也要能在收银台调出来。
// 一维码用 SVG（放多大都不虚），二维码也让 qrcode 输出 SVG。
//
// 画不出来的时候一定要说清楚 —— 在收银台面前看到一片空白是最糟的体验。
export default function BarcodeView({ code, format, height = 120, displayValue = true }) {
  const svgRef = useRef(null);
  const [qrSvg, setQrSvg] = useState('');
  const [error, setError] = useState('');

  // 二维码
  useEffect(() => {
    if (format !== 'QR') return;
    let cancelled = false;
    setError('');
    QRCode.toString(code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || '二维码画不出来');
      });
    return () => {
      cancelled = true;
    };
  }, [code, format]);

  // 一维码
  useEffect(() => {
    if (format === 'QR' || !svgRef.current) return;
    setError('');
    try {
      JsBarcode(svgRef.current, code, {
        format,
        height,
        displayValue,
        fontSize: 16,
        margin: 8,
        // 纯黑白：扫码枪靠反差识别，别用主题色
        lineColor: '#000000',
        background: '#ffffff',
      });
    } catch (e) {
      setError(e?.message || '这个码画不出来');
    }
  }, [code, format, height, displayValue]);

  if (error) {
    return (
      <div className="w-full py-6 px-3 text-center bg-persimmon/10 border border-persimmon/30 rounded-lg">
        <p className="text-persimmon text-sm font-medium">{error}</p>
        {/* 画不出来至少把号码显示出来，可以手输给收银员 */}
        <p className="font-mono text-lg mt-2 break-all select-all">{code}</p>
      </div>
    );
  }

  if (format === 'QR') {
    return (
      <div className="w-full flex flex-col items-center">
        {/* qrcode 输出的是完整 SVG 字符串，直接塞进容器 */}
        <div
          className="w-full max-w-[280px] [&>svg]:w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        {displayValue && (
          <p className="font-mono text-xs mt-2 break-all text-center select-all">{code}</p>
        )}
      </div>
    );
  }

  return <svg ref={svgRef} className="w-full h-auto" />;
}
