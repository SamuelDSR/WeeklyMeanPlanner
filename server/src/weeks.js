// 「本周」和「下一周」到底是哪一周 —— 全部按家庭所在时区算。
//
// 容器跑在 UTC，家在巴黎。如果直接用服务器的 new Date()，
// 巴黎时间周一凌晨 1 点（UTC 还是周日 23 点）会被算成"上一周"，
// 于是自动归档、通知、菜单页显示的周次全都会错一天。
const WEEK_LENGTH = 7;

// 某个时区里的"今天"，返回 'YYYY-MM-DD'
// en-CA 的日期格式正好是 YYYY-MM-DD，用它避免自己拼字符串出错
export function todayIn(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// 这个日期所在那一周的周一
export function mondayOf(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=周日
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return addDays(dateStr, -backToMonday);
}

// which: 'current' | 'next'  ->  那一周的周一
export function resolveWeekStart(which, timeZone) {
  const thisMonday = mondayOf(todayIn(timeZone));
  return which === 'next' ? addDays(thisMonday, WEEK_LENGTH) : thisMonday;
}

// 这一周是不是已经整周过完了（用于自动归档）
export function isWeekFinished(weekStart, timeZone) {
  return addDays(weekStart, WEEK_LENGTH - 1) < todayIn(timeZone);
}

export function normalizeWeekParam(value) {
  return value === 'next' ? 'next' : 'current';
}
