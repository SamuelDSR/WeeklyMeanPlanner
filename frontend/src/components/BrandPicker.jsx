import { useMemo, useState } from 'react';
import { X, Search, PenLine } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { useI18n } from '../i18n';

// 加卡的第一步：选商家。点一下就直接开相机去扫，名字/颜色/码制都不用填。
//
// 这一步存在的理由：手输一个 13 位卡号已经够烦了，再让人填一遍
// 「Carrefour」「EAN-13」「蓝色」，多数人第二张卡就不想加了。
export default function BrandPicker({ brands, onPick, onCustom, onClose }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    const list = keyword
      ? brands.filter((b) => b.name.toLowerCase().includes(keyword) || b.slug.includes(keyword))
      : brands;
    const byGroup = new Map();
    list.forEach((b) => {
      if (!byGroup.has(b.group)) byGroup.set(b.group, []);
      byGroup.get(b.group).push(b);
    });
    return Array.from(byGroup.entries());
  }, [brands, q]);

  return (
    <div className="fixed inset-0 z-50 bg-porcelain flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-mist bg-white pt-safe">
        <span className="font-display font-semibold">{t('brands.title')}</span>
        <button onClick={onClose} className="p-2.5 text-ink/50" aria-label={t('common.close')}>
          <X size={20} />
        </button>
      </div>

      <div className="px-3 py-2 bg-white border-b border-mist">
        <div className="flex items-center gap-2 bg-mist/50 rounded-lg px-2.5">
          <Search size={15} className="text-ink/35 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('brands.search')}
            className="flex-1 min-w-0 py-2 bg-transparent text-sm outline-none"
          />
        </div>
        <p className="text-[11px] text-ink/40 mt-1.5">{t('brands.hint')}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {groups.map(([group, list]) => (
          <div key={group}>
            <p className="text-[11px] text-ink/40 mb-2">{t(`brands.group.${group}`)}</p>
            <div className="grid grid-cols-4 gap-y-3">
              {list.map((b) => (
                <button
                  key={b.slug}
                  type="button"
                  onClick={() => onPick(b)}
                  className="flex flex-col items-center gap-1"
                >
                  <BrandLogo brand={b} size={46} />
                  <span className="text-[10px] text-ink/60 leading-tight text-center px-0.5 truncate w-full">
                    {b.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-center text-ink/35 text-sm py-6">{t('brands.noMatch')}</p>
        )}
      </div>

      {/* 列表里没有的商家 */}
      <div className="px-3 py-3 border-t border-mist bg-white pb-safe">
        <button
          type="button"
          onClick={onCustom}
          className="w-full py-2.5 rounded-lg border border-mist text-ink/70 text-sm flex items-center justify-center gap-1.5"
        >
          <PenLine size={15} /> {t('brands.custom')}
        </button>
      </div>
    </div>
  );
}
