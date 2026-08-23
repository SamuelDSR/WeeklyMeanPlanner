// 每周菜谱推荐算法：
// 1. 工作日优先选耗时短的菜，周末不限制
// 2. 尽量不选本周已经选过的菜（同一周内不重复）
// 3. 越久没做过的菜排名越靠前，然后在候选池前 40%（至少3个）里随机挑，
//    兼顾轮换多样性和结果不完全固定

// 每周只排午饭和晚饭：早饭各人各吃，排进计划里没意义（见迁移 012）。
// 加/减餐次只改这一行，前端有一份对应的 lib/constants.js。
export const MEAL_SLOTS = ['午餐', '晚餐'];
export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const WEEKDAY_TIME_LIMIT = 45;

function pickForMeal(recipes, meal, usedThisWeek, isWeekend) {
  let candidates = recipes.filter((r) => (r.meals || []).includes(meal));
  if (!isWeekend) {
    const lighter = candidates.filter((r) => (r.timeMinutes || 0) <= WEEKDAY_TIME_LIMIT);
    if (lighter.length > 0) candidates = lighter;
  }
  let fresh = candidates.filter((r) => !usedThisWeek.has(r.id));
  if (fresh.length === 0) fresh = candidates;
  if (fresh.length === 0) return null;

  fresh = [...fresh].sort(
    (a, b) => new Date(a.lastCookedDate || 0) - new Date(b.lastCookedDate || 0)
  );
  const poolSize = Math.max(3, Math.ceil(fresh.length * 0.4));
  const pool = fresh.slice(0, poolSize);
  return pool[Math.floor(Math.random() * pool.length)];
}

// 'YYYY-MM-DD' -> 本地时间的那一天（用分量构造，避免时区把日期推前后一天）
export function parseISODate(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getNextMonday(from = new Date()) {
  const d = new Date(from);
  const diff = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// recipes: [{id, name, meals, timeMinutes, lastCookedDate}]
// 返回 { weekStart, days: [{date, weekday, 午餐, 晚餐}] }（值是 recipeId 数组，可以为空）
// options.skipSlots: Set<'YYYY-MM-DD|餐次'> —— 已经排好的格子，一律不动
// options.alreadyUsed: 这一周已经用过的菜 id，避免又推荐同一道
//
// 返回的 day[meal] 是「要往这一格插入的菜」：空数组 = 什么都不插
// （已排好的格子和实在没菜可选的格子都是空数组，对调用方来说动作一样）
export function generateWeeklyMenu(recipes, options = {}) {
  if (!recipes || recipes.length === 0) {
    throw new Error('菜品库是空的，先去添加几道菜吧');
  }
  // weekStart：要排哪一周（'YYYY-MM-DD' 的周一）。不传就还是"下一周"，
  // 这样老的调用方式不会变。
  const { skipSlots = new Set(), alreadyUsed = [], weekStart } = options;

  const monday = weekStart ? parseISODate(weekStart) : getNextMonday();
  const usedThisWeek = new Set(alreadyUsed);
  const days = WEEKDAY_LABELS.map((weekday, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const isWeekend = i === 5 || i === 6;
    const dateStr = formatDateISO(date);

    const day = { date: dateStr, weekday };
    MEAL_SLOTS.forEach((meal) => {
      // 这一格已经有东西了（自己排的菜、或者标了"出去吃"）—— 不碰
      if (skipSlots.has(`${dateStr}|${meal}`)) {
        day[meal] = [];
        return;
      }
      // 空格子里先放一道菜，之后用户可以在页面上继续往这一顿里加菜
      const pick = pickForMeal(recipes, meal, usedThisWeek, isWeekend);
      if (pick) {
        usedThisWeek.add(pick.id);
        day[meal] = [pick.id];
      } else {
        day[meal] = [];
      }
    });
    return day;
  });

  return { weekStart: formatDateISO(monday), days };
}
