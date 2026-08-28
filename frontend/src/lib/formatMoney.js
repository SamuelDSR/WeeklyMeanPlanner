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

// 期间：'2026-08'（月）或 '2026'（年）
export function currentYear(date = new Date()) {
  return String(date.getFullYear());
}

export function shiftPeriod(period, delta) {
  if (/^\d{4}$/.test(period)) return String(Number(period) + delta);
  return shiftMonth(period, delta);
}

// 不能翻到未来：还没发生的月份没有账
export function isFuturePeriod(period, now = new Date()) {
  if (/^\d{4}$/.test(period)) return Number(period) >= now.getFullYear() + 1;
  return period >= shiftMonth(currentMonth(now), 1);
}

// 月 <-> 年 互相转换，切粒度时保住当前年份
export function toGranularity(period, granularity) {
  const year = period.slice(0, 4);
  if (granularity === 'year') return year;
  // 从年切回月：同一年的话停在当前月，否则停在那年的 1 月
  const now = currentMonth();
  return year === now.slice(0, 4) ? now : `${year}-01`;
}
