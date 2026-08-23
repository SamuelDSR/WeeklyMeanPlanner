// 主食：米饭 / 面条 / 意面这些，和菜一起吃。
//
// 为什么单独一套逻辑，而不是当成一道菜（recipes.category='主食'）：
// 算量的方式根本不同。
//
//   菜   一份够 4 人，整份做   ->  ceil(顿数 x 人数 / 4)   多的放冰箱
//   主食 每人 75 g 生米，线性  ->  75 x 人数 x 顿数        没有"整份"的概念
//
// 而且主食几乎每顿都有 —— 要是每顿都得手动加一次米饭，那还不如不做这个功能。
// 所以规则是「家庭默认 + 按顿例外」：
//
//   families.default_staple_id + staple_meals   ->  午餐/晚餐 自动配米饭
//   menu_staples 有行                            ->  这一顿听它的（换成意面、或者不要）
//
// menu_staples **只存例外**，没有行就是用默认值。这样改了默认主食之后，
// 整周自动跟着变，不用去回填每一顿。
import { MEAL_SLOTS } from './recommend.js';
import { lookupUnit, roundQty } from './units.js';

// 新家庭开箱就能用的一套主食（中式为主，加上在法国常吃的意面）
export const DEFAULT_STAPLES = [
  { name: '米饭', amountPerPerson: 75, unit: 'g', category: '干货粮油' },
  { name: '面条', amountPerPerson: 100, unit: 'g', category: '干货粮油' },
  { name: '意面', amountPerPerson: 100, unit: 'g', category: '干货粮油' },
  { name: '馒头', amountPerPerson: 1, unit: '个', category: '干货粮油' },
];

export const DEFAULT_STAPLE_MEALS = ['午餐', '晚餐'];

// 建家庭时铺一套主食，并把第一个（米饭）设成默认。
// 用传进来的 client 是为了跟建家庭那步在同一个事务里。
export async function seedFamilyStaples(client, familyId) {
  const ids = [];
  for (let i = 0; i < DEFAULT_STAPLES.length; i += 1) {
    const s = DEFAULT_STAPLES[i];
    const r = await client.query(
      `INSERT INTO staples (family_id, name, amount_per_person, unit, category, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [familyId, s.name, s.amountPerPerson, s.unit, s.category, i]
    );
    ids.push(r.rows[0].id);
  }
  await client.query('UPDATE families SET default_staple_id=$1 WHERE id=$2', [ids[0], familyId]);
  return ids;
}

export function toStapleJson(row) {
  return {
    id: row.id,
    name: row.name,
    amountPerPerson: Number(row.amount_per_person),
    unit: row.unit,
    category: row.category,
    sortOrder: row.sort_order,
  };
}

// 一顿饭要配的主食，来源有三种：
//   explicit  这一顿单独指定过（menu_staples 里有行）
//   default   没指定，走家庭默认
//   null      不配主食
//
// 判断顺序很重要：
//   1. 出去吃 -> 没有主食（也不该进购物清单）
//   2. menu_staples 有行 -> 听它的（哪怕这一顿还没排菜，用户明确要求了就算）
//   3. 家庭默认 -> 只补给「已经排了菜」的那几顿。空格子不该凭空多出米饭。
function stapleForMeal({ meal, dishCount, isEatOut, override, family, staplesById }) {
  if (isEatOut) return null;

  if (override) {
    if (override.is_none) return null;
    // 快照优先：主食被改名/删掉之后，这一顿记的还是当时那个
    const live = override.staple_id != null ? staplesById.get(override.staple_id) : null;
    return {
      stapleId: override.staple_id ?? null,
      name: override.staple_name ?? live?.name ?? '',
      amountPerPerson: Number(override.amount_per_person ?? live?.amountPerPerson ?? 0),
      unit: override.unit ?? live?.unit ?? '',
      category: override.category ?? live?.category ?? '干货粮油',
      source: 'explicit',
    };
  }

  if (dishCount === 0) return null;
  if (!family.stapleMeals.includes(meal)) return null;
  const def = family.defaultStapleId != null ? staplesById.get(family.defaultStapleId) : null;
  if (!def) return null;
  return { ...def, stapleId: def.id, source: 'default' };
}

// days: buildWeekDays() 的结果
// overrideRows: menu_staples 的原始行
// family: { defaultStapleId, stapleMeals }
// staples: toStapleJson() 之后的数组
//
// 返回 { byDate: { 'YYYY-MM-DD': { 午餐: {...}|null, ... } }, mealCount }
export function resolveWeekStaples(days, overrideRows, family, staples) {
  const staplesById = new Map(staples.map((s) => [s.id, s]));
  const overrides = new Map(
    (overrideRows || []).map((r) => [
      `${typeof r.date === 'string' ? r.date : r.date.toISOString().slice(0, 10)}|${r.meal_slot}`,
      r,
    ])
  );

  const byDate = {};
  let mealCount = 0;

  (days || []).forEach((day) => {
    const perMeal = {};
    MEAL_SLOTS.forEach((meal) => {
      const resolved = stapleForMeal({
        meal,
        dishCount: (day[meal] || []).length,
        isEatOut: (day.eatOut || []).includes(meal),
        override: overrides.get(`${day.date}|${meal}`),
        family,
        staplesById,
      });
      perMeal[meal] = resolved;
      if (resolved) mealCount += 1;
    });
    byDate[day.date] = perMeal;
  });

  return { byDate, mealCount };
}

// 一周主食总量：按「名字 + 单位」归并，每人份量 x 人数 x 顿数。
// 返回的形状和购物清单的条目一致，好直接汇进去。
export function computeStaplePlan(resolvedByDate, memberCount) {
  const people = Math.max(1, Number(memberCount) || 1);
  const agg = new Map();

  Object.entries(resolvedByDate || {}).forEach(([date, perMeal]) => {
    Object.entries(perMeal).forEach(([meal, staple]) => {
      if (!staple) return;
      const key = `${staple.name.trim().toLowerCase()}|${(staple.unit || '').toLowerCase()}`;
      const prev = agg.get(key);
      agg.set(key, {
        name: staple.name.trim(),
        unit: staple.unit || '',
        category: staple.category || '干货粮油',
        amountPerPerson: staple.amountPerPerson,
        meals: (prev?.meals || 0) + 1,
        // 哪几顿用到它，做饭的人一眼能对上
        occurrences: [...(prev?.occurrences || []), { date, meal }],
      });
    });
  });

  return Array.from(agg.values())
    .map((e) => ({
      ...e,
      qty: roundQty(e.amountPerPerson * people * e.meals),
      // 能换算的单位（g/kg）才允许和食材里的同名条目合并
      convertible: !!lookupUnit(e.unit),
    }))
    .sort((a, b) => b.meals - a.meals || a.name.localeCompare(b.name, 'zh'));
}
