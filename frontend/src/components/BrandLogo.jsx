// 商家的「logo」：品牌色底 + 首字母。
//
// 不用真 logo：版权是一回事，几十张图也会把安装包撑大、离线还得缓存。
// 而且在货架前找卡，先认到的本来就是颜色。
export default function BrandLogo({ brand, size = 44, className = '' }) {
  const px = `${size}px`;
  if (!brand) return null;
  return (
    <span
      className={`shrink-0 rounded-xl flex items-center justify-center font-display font-bold ${className}`}
      style={{
        width: px,
        height: px,
        background: brand.color,
        // 浅色底（麦当劳黄、Fnac 金）配白字看不清，按亮度自动切黑字
        color: isLight(brand.color) ? '#22302B' : '#ffffff',
        fontSize: `${Math.round(size * (brand.short.length > 1 ? 0.34 : 0.45))}px`,
      }}
    >
      {brand.short}
    </span>
  );
}

// 感知亮度（不是简单平均：人眼对绿最敏感、蓝最不敏感）
function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
