// 过去几周的吃饭记录 + 汇总统计。
//
// 这份数据有两个用处：
//   1. 界面上看「过去这些周都吃了什么、吃得健康不健康」
//   2. 以后做推荐算法时当输入（所以按餐次一条条给出来，而不是只给汇总数）
import { MEAL_SLOTS } from './recommend.js';

function average(values) {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

// meals: [{ date, weekday, mealSlot, eatOut, recipeId, recipeName, healthScore, likeScore }]
export function summarize(meals) {
  const cooked = meals.filter((m) => !m.eatOut);
  return {
    dishMeals: cooked.length,
    eatOutMeals: meals.filter((m) => m.eatOut).length,
    storeBoughtMeals: cooked.filter((m) => m.isStoreBought).length,
    // 没评分的菜不参与平均，否则会把平均值拉歪
    avgHealth: average(cooked.filter((m) => m.healthScore != null).map((m) => m.healthScore)),
    avgLike: average(cooked.filter((m) => m.likeScore != null).map((m) => m.likeScore)),
    ratedMeals: cooked.filter((m) => m.healthScore != null).length,
    likeRatedMeals: cooked.filter((m) => m.likeScore != null).length,
  };
}

// 把 menu_slots 的行（已 join 好菜谱信息）整理成按周分组的记录
export function buildHistory(menuRows, slotRows) {
  const slotsByMenu = new Map();
  slotRows.forEach((row) => {
    if (!slotsByMenu.has(row.weekly_menu_id)) slotsByMenu.set(row.weekly_menu_id, []);
    slotsByMenu.get(row.weekly_menu_id).push({
      date: typeof row.date === 'string' ? row.date : row.date.toISOString().slice(0, 10),
      weekday: row.weekday,
      mealSlot: row.meal_slot,
      slotId: row.id,
      eatOut: row.is_eat_out,
      recipeId: row.recipe_id,
      // 菜名用格子上的快照：菜谱被删了也还看得出那天吃的是什么
      recipeName: row.recipe_name,
      recipeDeleted: row.recipe_id == null && !row.is_eat_out,
      // 健康分是菜本身的属性，跟着菜谱走
      healthScore: row.health_score,
      // 喜好分优先用"这一顿"的；这一顿没单独评过就用菜谱上的默认值
      likeScore: row.meal_like_score ?? row.recipe_like_score ?? null,
      mealLikeScore: row.meal_like_score ?? null,
      isStoreBought: row.is_store_bought ?? false,
    });
  });

  const weeks = menuRows.map((menu) => {
    const meals = (slotsByMenu.get(menu.id) || []).sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        MEAL_SLOTS.indexOf(a.mealSlot) - MEAL_SLOTS.indexOf(b.mealSlot)
    );
    return {
      weekStart: typeof menu.week_start === 'string'
        ? menu.week_start
        : menu.week_start.toISOString().slice(0, 10),
      confirmedAt: menu.confirmed_at,
      meals,
      stats: summarize(meals),
    };
  });

  const allMeals = weeks.flatMap((w) => w.meals);
  return { weeks, overall: { weeks: weeks.length, ...summarize(allMeals) } };
}

// 吃得最多的菜（给界面看，也给以后的算法参考）
export function topDishes(meals, limit = 10) {
  const counts = new Map();
  meals
    .filter((m) => !m.eatOut && m.recipeId != null)
    .forEach((m) => {
      const prev = counts.get(m.recipeId);
      counts.set(m.recipeId, {
        recipeId: m.recipeId,
        name: m.recipeName,
        healthScore: m.healthScore,
        likeScore: m.likeScore,
        count: (prev?.count || 0) + 1,
      });
    });
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'))
    .slice(0, limit);
}
