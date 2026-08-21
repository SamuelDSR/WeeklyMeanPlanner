import { Heart, Leaf } from 'lucide-react';
import { useI18n } from '../i18n';

const ICONS = { health: Leaf, like: Heart };
const COLORS = { health: 'text-matcha', like: 'text-persimmon' };
const MAX = 5;

// 1-5 的打分，点一下选中，点已选中的那个取消（回到"没评"）。
//
// 手机上要点得中：可点的时候给每个图标加 p-2 的内边距，
// 图标 20px + 上下各 8px = 36px 左右的点击面积（只读时不加，省地方）。
export default function ScorePicker({ kind, value, onChange, readOnly = false, size }) {
  const { t } = useI18n();
  const Icon = ICONS[kind] || Leaf;
  const activeColor = COLORS[kind] || 'text-indigo';
  const iconSize = size ?? (readOnly ? 12 : 20);

  return (
    <div className={`flex items-center ${readOnly ? 'gap-0.5' : '-mx-1'}`}>
      {Array.from({ length: MAX }, (_, i) => i + 1).map((n) => {
        const filled = value != null && n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(value === n ? null : n)}
            className={`${readOnly ? 'cursor-default' : 'cursor-pointer p-2'} ${
              filled ? activeColor : 'text-ink/15'
            }`}
            aria-label={t('common.scoreAria', { n })}
          >
            <Icon size={iconSize} fill={filled ? 'currentColor' : 'none'} strokeWidth={2} />
          </button>
        );
      })}
      {value == null && !readOnly && <span className="text-xs text-ink/30 ml-1">{t('common.notRated')}</span>}
    </div>
  );
}
