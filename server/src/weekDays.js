// 一周日期骨架：把 menu_slots 的行填回「7 天 x 4 餐」的结构里。
// menu.js 和 shopping.js 都要用同一套，所以放在这里。
import { MEAL_SLOTS, WEEKDAY_LABELS } from './recommend.js';

// 'YYYY-MM-DD' 加 n 天。用年月日分量构造，避免时区把日期推前/推后一天
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export function toDateStr(d) {
  return typeof d === 'string' ? d : d.toISOString().slice(0, 10);
}

// 一周 7 天 x 4 餐的完整骨架，再把 menu_slots 里的菜填进去。
// 从 week_start 推算而不是从行数据反推：空格子现在就是没有行，
// 直接按行拼的话，一整天都没安排就会整天消失。
export function buildWeekDays(weekStart, slotRows) {
  const byDate = new Map(); // date -> { meals: Map<meal, ids[]>, eatOut: Set<meal> }
  slotRows.forEach((row) => {
    const date = toDateStr(row.date);
    if (!byDate.has(date)) byDate.set(date, { meals: new Map(), eatOut: new Set() });
    const entry = byDate.get(date);
    if (row.is_eat_out) {
      entry.eatOut.add(row.meal_slot);
      return;
    }
    if (!entry.meals.has(row.meal_slot)) entry.meals.set(row.meal_slot, []);
    entry.meals.get(row.meal_slot).push(row.recipe_id);
  });

  return WEEKDAY_LABELS.map((weekday, i) => {
    const date = addDays(toDateStr(weekStart), i);
    const entry = byDate.get(date);
    // eatOut 是这一天里"出去吃"的餐次名列表，和 day[meal] 的菜品数组并行存在
    const day = { date, weekday, eatOut: entry ? Array.from(entry.eatOut) : [] };
    MEAL_SLOTS.forEach((meal) => {
      day[meal] = entry?.meals.get(meal) ?? [];
    });
    return day;
  });
}
