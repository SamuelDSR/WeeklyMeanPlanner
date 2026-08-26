// 金额显示。用 Intl 按当前语言排版（法语是 12,50 €，中文是 €12.50）。
//
// 绝不做汇率换算：不同货币各显示各的（详见 server/src/money.js 的说明）。
const CACHE = new Map();

export function formatMoney(amount, currency = 'EUR', locale = 'zh') {
  const key = `${locale}|${currency}`;
  if (!CACHE.has(key)) {
    try {
      CACHE.set(
        key,
        new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : locale, {
          style: 'currency',
          currency,
        })
      );
    } catch {
      // 认不出来的货币代码：退回成「数字 + 代码」
      CACHE.set(key, null);
    }
  }
  const fmt = CACHE.get(key);
  const n = Number(amount) || 0;
  return fmt ? fmt.format(n) : `${n.toFixed(2)} ${currency}`;
}

// 多种货币的合计：各显示各的，用「+」连起来，不加在一起
export function formatTotals(totals, locale = 'zh') {
  if (!totals || totals.length === 0) return formatMoney(0, 'EUR', locale);
  return totals.map((t) => formatMoney(t.total, t.currency, locale)).join(' + ');
}

// 本月的 'YYYY-MM'
export function currentMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
