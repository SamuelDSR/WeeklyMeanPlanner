import CategoryIcon from './CategoryIcon';
import { formatTotals } from '../lib/formatMoney';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 每个分类花了多少，带占比条。
//
// 占比只在**单一货币**时才算得出来 —— 有 EUR 又有 CHF 的时候，
// 「餐饮占 30%」这个数需要先换算，而我们不做换算（见 server/src/money.js）。
// 所以多货币时只列金额，不画条，也不给百分比。
export default function CategoryBreakdown({ byCategory, categories, title, emptyText }) {
  const { t, locale } = useI18n();

  const rows = Object.entries(byCategory || {})
    .map(([name, v]) => ({
      name,
      totals: v.totals,
      count: v.count,
      icon: categories.find((c) => c.value === name)?.icon,
      // 只有一种货币时才有可比的数值
      single: v.totals.length === 1 ? v.totals[0].total : null,
    }))
    .sort((a, b) => (b.single ?? 0) - (a.single ?? 0) || a.name.localeCompare(b.name, 'zh'));

  if (rows.length === 0) {
    return <p className="text-xs text-ink/35 py-3 text-center">{emptyText}</p>;
  }

  const mixedCurrency = rows.some((r) => r.single === null);
  const grand = mixedCurrency ? 0 : rows.reduce((sum, r) => sum + (r.single ?? 0), 0);

  return (
    <div>
      <p className="text-xs text-ink/50 mb-2">{title}</p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = !mixedCurrency && grand > 0 ? Math.round((r.single / grand) * 100) : null;
          return (
            <li key={r.name}>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-7 h-7 rounded-full bg-mist/70 text-ink/55 flex items-center justify-center shrink-0">
                  <CategoryIcon name={r.icon} size={14} />
                </span>
                <span className="text-ink/70 min-w-0 truncate flex-1">
                  {domainLabel(locale, 'expenseCategory', r.name)}
                </span>
                {pct !== null && <span className="text-[11px] text-ink/35 shrink-0">{pct}%</span>}
                <span className="font-mono text-xs text-ink/60 shrink-0">
                  {formatTotals(r.totals, locale)}
                </span>
              </div>
              {pct !== null && (
                <div className="h-1 bg-mist rounded-full mt-1 ml-9 overflow-hidden">
                  <div className="h-full bg-indigo/60 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {mixedCurrency && (
        <p className="text-[11px] text-ink/35 mt-2">{t('ledger.mixedCurrencyNote')}</p>
      )}
    </div>
  );
}
