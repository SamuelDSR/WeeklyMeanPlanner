// 「这一周每道菜要做几份」的换算。
//
// 一份菜谱做出来够 servings 个人吃；家里有 memberCount 口人；
// 一道菜在这一周的菜单里出现了 occurrences 次（比如连着安排 4 顿晚饭）。
//
//   需要的份量 = 出现次数 x 家庭人数
//   要做几倍   = ceil(需要的份量 / 一份够几人)
//
// 例：hachis parmentier 一份够 4 人，家里 3 口人，安排了 4 顿晚饭
//     -> 需要 4 x 3 = 12 人份 -> 12 / 4 = 3，做 3 整份
//
// 用 ceil 是因为菜是整份做的，多出来的放冰箱下一顿吃 —— 宁可多不可少。
import { MEAL_SLOTS } from './recommend.js';
import { roundQty } from './units.js';

const DEFAULT_SERVINGS = 4;
const DEFAULT_MEMBER_COUNT = 2;

// days: [{ date, weekday, 早餐: [recipeId,...], ... }]
// 统计每道菜在这一周出现了几次
export function countOccurrences(days) {
  const counts = new Map();
  (days || []).forEach((day) => {
    MEAL_SLOTS.forEach((meal) => {
      const ids = day[meal];
      if (!Array.isArray(ids)) return;
      ids.forEach((id) => {
        if (id != null) counts.set(id, (counts.get(id) || 0) + 1);
      });
    });
  });
  return counts;
}

export function batchesFor(occurrences, memberCount, servings) {
  const people = Math.max(1, Number(memberCount) || DEFAULT_MEMBER_COUNT);
  const perBatch = Math.max(1, Number(servings) || DEFAULT_SERVINGS);
  const portionsNeeded = occurrences * people;
  return {
    portionsNeeded,
    batches: Math.ceil(portionsNeeded / perBatch),
    servings: perBatch,
  };
}

// recipesById: Map<id, { name, servings, ingredients }>
// 返回这一周的备餐计划，一道菜一条
export function computeDishPlan(days, recipesById, memberCount) {
  const counts = countOccurrences(days);
  const plan = [];

  counts.forEach((occurrences, recipeId) => {
    const recipe = recipesById.get(recipeId);
    if (!recipe) return;
    const { portionsNeeded, batches, servings } = batchesFor(
      occurrences,
      memberCount,
      recipe.servings
    );
    plan.push({
      recipeId,
      name: recipe.name,
      occurrences,
      servings,
      portionsNeeded,
      batches,
      // 买现成的显示成「买 N 盒」而不是「做 N 份」
      isStoreBought: !!recipe.isStoreBought,
      purchase: recipe.purchase
        ? { qty: roundQty(recipe.purchase.qty * batches), unit: recipe.purchase.unit }
        : null,
    });
  });

  return plan.sort((a, b) => b.batches - a.batches || a.name.localeCompare(b.name, 'zh'));
}
