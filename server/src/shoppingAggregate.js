// 把一周菜单里所有菜的食材 + 主食汇总成购物清单。
//
// 三件事：
//   1. 按「要做几份」放大用量 —— 一道菜安排了 4 顿、家里 3 口人、一份够 4 人
//      => 做 3 整份 => 食材也要 x3（详见 portions.js）
//   2. 主食按人按顿线性算，不放大成整份（详见 staples.js）
//   3. 同一食材按量纲合并 —— 1 kg 土豆 + 200 g 土豆 = 1200 g 土豆（详见 units.js）
//
// 可选食材（香菜、辣椒这种）**单独成行**，不混进必买的量里：
//   土豆 1000 g          <- 必买
//   土豆 200 g（可选）    <- 可有可无，在超市自己决定
import { lookupUnit, roundQty } from './units.js';
import { computeDishPlan } from './portions.js';
import { computeStaplePlan } from './staples.js';

// 食材名去空格、忽略大小写来分组（Potato / potato 是同一样东西），
// 显示的时候用第一次出现的写法。
// 可选与否也进 key：可选的那部分要单独成行。
function groupKey(name, unitInfo, rawUnit, isOptional) {
  const normalizedName = (name || '').trim().toLowerCase();
  const flag = isOptional ? '|opt' : '';
  return unitInfo
    ? `${normalizedName}|dim:${unitInfo.dimension}${flag}`
    : `${normalizedName}|unit:${rawUnit.toLowerCase()}${flag}`;
}

// 纯函数：拿上一次的累计值和一条食材用量，返回新的累计值（不改原对象）
function mergeIngredient(previous, ing, amount, unitInfo, rawUnit, isOptional) {
  const base = previous || {
    name: (ing.name || '').trim(),
    category: ing.category || '其他',
    isOptional: !!isOptional,
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
  const shared = { name: entry.name, category: entry.category, isOptional: entry.isOptional };
  if (entry.dimension && entry.finest) {
    return {
      ...shared,
      qty: roundQty(entry.baseQty / entry.finest.factor),
      unit: entry.finest.unit,
    };
  }
  return { ...shared, qty: roundQty(entry.qty), unit: entry.unit };
}

// days: [{ date, weekday, 午餐: [recipeId,...], 晚餐: [...] }]
// recipesById: Map<id, { name, servings, ingredients:[{name,amount,unit,category,isOptional}] }>
// stapleTotals: computeStaplePlan() 的结果（可以不传）
export function buildShoppingList(days, recipesById, memberCount, stapleTotals = []) {
  const plan = computeDishPlan(days, recipesById, memberCount);
  const agg = new Map();
  const missingDishNames = [];

  const add = (ing, amount, isOptional) => {
    const rawUnit = (ing.unit || '').trim();
    const unitInfo = lookupUnit(rawUnit);
    const key = groupKey(ing.name, unitInfo, rawUnit, isOptional);
    agg.set(key, mergeIngredient(agg.get(key), ing, amount, unitInfo, rawUnit, isOptional));
  };

  plan.forEach(({ recipeId, batches }) => {
    const recipe = recipesById.get(recipeId);
    if (!recipe) return;

    const ingredients = recipe.ingredients || [];
    // 一道菜连必买的食材都没有 -> 提醒用户去补（可选食材不算，只有可选的等于没填）
    if (ingredients.filter((i) => !i.isOptional).length === 0) {
      missingDishNames.push(recipe.name);
      if (ingredients.length === 0) return;
    }

    ingredients.forEach((ing) => {
      add(ing, (Number(ing.amount) || 0) * batches, !!ing.isOptional);
    });
  });

  // 主食汇进同一张表：名字和单位撞上的话（比如菜谱里也有"意面"）会自动合并
  (stapleTotals || []).forEach((s) => {
    add({ name: s.name, unit: s.unit, category: s.category }, s.qty, false);
  });

  const items = Array.from(agg.values())
    .map(toItem)
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category, 'zh') ||
        // 必买的排在可选的前面
        Number(a.isOptional) - Number(b.isOptional) ||
        a.name.localeCompare(b.name, 'zh')
    );

  return { items, missingDishNames, plan };
}
