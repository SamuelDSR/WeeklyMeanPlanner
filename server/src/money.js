// 金额处理。
//
// 一条铁律：**不同货币绝不相加**。度假在瑞士花的 CHF 和家里的 EUR 是两笔账，
// 汇率会天天变，我们手上也没有可信的汇率源 —— 编一个出来只会让账变成假的。
// 所以所有汇总都按货币分组，各算各的。
const MAX_AMOUNT = 1e9;

// 常见货币的小数位。日元没有小数。
const DECIMALS = { JPY: 0, KRW: 0, VND: 0 };

export const SUPPORTED_CURRENCIES = [
  'EUR', 'USD', 'CNY', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF',
];

export function currencyDecimals(currency) {
  return DECIMALS[currency] ?? 2;
}

// 用户输入的金额 -> 规范化的数字。认逗号小数点（法语键盘打出来是 12,50）
export function parseAmount(input, currency = 'EUR') {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return roundMoney(input, currency);
  }
  if (typeof input !== 'string') return null;
  // 去掉空格和千分位，逗号当小数点
  const cleaned = input.trim().replace(/\s/g, '').replace(/,/g, '.');
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || Math.abs(n) > MAX_AMOUNT) return null;
  return roundMoney(n, currency);
}

export function roundMoney(value, currency = 'EUR') {
  const f = 10 ** currencyDecimals(currency);
  return Math.round(value * f) / f;
}

export function isSupportedCurrency(currency) {
  return typeof currency === 'string' && SUPPORTED_CURRENCIES.includes(currency);
}

// 一堆开销 -> 按货币分组的合计。返回 [{ currency, total, count }]，金额大的在前。
export function sumByCurrency(rows) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const currency = r.currency || 'EUR';
    const prev = map.get(currency) || { currency, total: 0, count: 0 };
    map.set(currency, {
      currency,
      total: prev.total + Number(r.amount || 0),
      count: prev.count + 1,
    });
  });
  return Array.from(map.values())
    .map((e) => ({ ...e, total: roundMoney(e.total, e.currency) }))
    // 金额相同时按货币代码排，保证顺序稳定 —— 不然界面上两行会随机换位置
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.currency.localeCompare(b.currency));
}

// 按某个字段分组再各自按货币合计。
// keyOf 返回 null 的行归到 nullKey（比如没挂子账本的算「日常」）
export function groupSums(rows, keyOf, nullKey = '__none__') {
  const buckets = new Map();
  (rows || []).forEach((r) => {
    const key = keyOf(r) ?? nullKey;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  });
  const out = {};
  buckets.forEach((list, key) => {
    out[key] = { totals: sumByCurrency(list), count: list.length };
  });
  return out;
}

// 收入和支出分开算，再给出结余。
//
// 绝不把两者加成一个数：一个 SUM 出来是「净额」，但「这个月花了多少」
// 和「这个月挣了多少」是两个问题，混在一起两个都答不了。
export function splitByKind(rows) {
  const expense = (rows || []).filter((r) => (r.kind || 'expense') === 'expense');
  const income = (rows || []).filter((r) => r.kind === 'income');
  const expenseTotals = sumByCurrency(expense);
  const incomeTotals = sumByCurrency(income);

  // 结余按货币逐个算。某个货币只有支出没有收入也要出现（结余是负的）
  const currencies = new Set([
    ...expenseTotals.map((t) => t.currency),
    ...incomeTotals.map((t) => t.currency),
  ]);
  const net = Array.from(currencies)
    .map((currency) => {
      const inc = incomeTotals.find((t) => t.currency === currency)?.total ?? 0;
      const exp = expenseTotals.find((t) => t.currency === currency)?.total ?? 0;
      return { currency, total: roundMoney(inc - exp, currency) };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.currency.localeCompare(b.currency));

  return { expense: expenseTotals, income: incomeTotals, net };
}
