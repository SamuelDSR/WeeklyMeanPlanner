// 把一周菜单里所有菜的食材汇总成购物清单。
//
// 两件事：
//   1. 按「要做几份」放大用量 —— 一道菜安排了 4 顿、家里 3 口人、一份够 4 人
//      => 做 3 整份 => 食材也要 x3（详见 portions.js）
//   2. 同一食材按量纲合并 —— 1 kg 土豆 + 200 g 土豆 = 1200 g 土豆（详见 units.js）
import { lookupUnit, roundQty } from './units.js';
import { computeDishPlan } from './portions.js';

// 食材名去空格、忽略大小写来分组（Potato / potato 是同一样东西），
// 显示的时候用第一次出现的写法
function groupKey(name, unitInfo, rawUnit) {
  const normalizedName = (name || '').trim().toLowerCase();
  return unitInfo
    ? `${normalizedName}|dim:${unitInfo.dimension}`
    : `${normalizedName}|unit:${rawUnit.toLowerCase()}`;
}

// 纯函数：拿上一次的累计值和一条食材用量，返回新的累计值（不改原对象）
function mergeIngredient(previous, ing, amount, unitInfo, rawUnit) {
  const base = previous || {
    name: (ing.name || '').trim(),
    category: ing.category || '其他',
    dimension: unitInfo?.dimension ?? null,
    baseQty: 0, // 可换算时：累计到基准单位
    finest: null, // 可换算时：用过的最小单位 { unit, factor }
    qty: 0, // 不可换算时：直接累加
    unit: rawUnit,
  };

  if (!unitInfo) {
    return { ...base, qty: base.qty + amount };
  }

  const isFinest = !base.finest || unitInfo.factor < base.finest.factor;
  return {
    ...base,
    baseQty: base.baseQty + amount * unitInfo.factor,
    finest: isFinest
      ? { unit: unitInfo.display || rawUnit, factor: unitInfo.factor }
      : base.finest,
  };
}

// 累计值 -> 清单上的一行
function toItem(entry) {
  if (entry.dimension && entry.finest) {
    return {
      name: entry.name,
      category: entry.category,
      qty: roundQty(entry.baseQty / entry.finest.factor),
      unit: entry.finest.unit,
    };
  }
  return {
    name: entry.name,
    category: entry.category,
    qty: roundQty(entry.qty),
    unit: entry.unit,
  };
}

// days: [{ date, weekday, 早餐: [recipeId,...], ... }]
// recipesById: Map<id, { name, servings, ingredients:[{name,amount,unit,category}] }>
export function buildShoppingList(days, recipesById, memberCount) {
  const plan = computeDishPlan(days, recipesById, memberCount);
  const agg = new Map();
  const missingDishNames = [];

  plan.forEach(({ recipeId, batches }) => {
    const recipe = recipesById.get(recipeId);
    if (!recipe) return;

    const ingredients = recipe.ingredients || [];
    if (ingredients.length === 0) {
      missingDishNames.push(recipe.name);
      return;
    }

    ingredients.forEach((ing) => {
      const rawUnit = (ing.unit || '').trim();
      const unitInfo = lookupUnit(rawUnit);
      const amount = (Number(ing.amount) || 0) * batches;
      const key = groupKey(ing.name, unitInfo, rawUnit);
      agg.set(key, mergeIngredient(agg.get(key), ing, amount, unitInfo, rawUnit));
    });
  });

  const items = Array.from(agg.values())
    .map(toItem)
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category, 'zh') || a.name.localeCompare(b.name, 'zh')
    );

  return { items, missingDishNames, plan };
}
