import { makeSuite } from './helpers.mjs';
import { resolveWeekStaples, computeStaplePlan } from '../src/staples.js';
import { buildShoppingList } from '../src/shoppingAggregate.js';

export default function run() {
  const { eq, done } = makeSuite('staples + 购物清单');

  const STAPLES = [
    { id: 1, name: '米饭', amountPerPerson: 75, unit: 'g', category: '干货粮油' },
    { id: 2, name: '意面', amountPerPerson: 100, unit: 'g', category: '干货粮油' },
  ];
  const family = { defaultStapleId: 1, stapleMeals: ['午餐', '晚餐'] };
  const days = [
    { date: '2026-08-24', weekday: '周一', eatOut: [], 午餐: [10], 晚餐: [10, 11] },
    { date: '2026-08-25', weekday: '周二', eatOut: ['晚餐'], 午餐: [10], 晚餐: [] },
    { date: '2026-08-26', weekday: '周三', eatOut: [], 午餐: [], 晚餐: [] },
  ];

  let r = resolveWeekStaples(days, [], family, STAPLES);
  eq('排了菜的午餐走默认米饭', r.byDate['2026-08-24'].午餐?.name, '米饭');
  eq('来源标成 default', r.byDate['2026-08-24'].晚餐?.source, 'default');
  eq('早餐已经不是餐次了', Object.keys(r.byDate['2026-08-24']).sort(), ['午餐', '晚餐']);
  eq('出去吃不配主食', r.byDate['2026-08-25'].晚餐, null);
  eq('空格子不凭空加米饭', r.byDate['2026-08-26'].晚餐, null);
  eq('共 3 顿有主食', r.mealCount, 3);

  const overrides = [
    { date: '2026-08-24', meal_slot: '晚餐', staple_id: 2, staple_name: '意面', amount_per_person: 100, unit: 'g', category: '干货粮油', is_none: false },
    { date: '2026-08-25', meal_slot: '午餐', staple_id: null, staple_name: null, is_none: true },
  ];
  r = resolveWeekStaples(days, overrides, family, STAPLES);
  eq('单顿改成意面', r.byDate['2026-08-24'].晚餐?.name, '意面');
  eq('改过的标成 explicit', r.byDate['2026-08-24'].晚餐?.source, 'explicit');
  eq('明确不要主食', r.byDate['2026-08-25'].午餐, null);

  r = resolveWeekStaples(days, [], family, STAPLES);
  eq('米饭 75g x 3人 x 3顿', computeStaplePlan(r.byDate, 3).find((s) => s.name === '米饭')?.qty, 675);

  // 可选食材单独成行，不并进必买量
  const oneDay = [{ date: '2026-08-24', weekday: '周一', eatOut: [], 午餐: [], 晚餐: [10] }];
  const recipes = new Map([[10, { name: 'A', servings: 4, ingredients: [
    { name: '土豆', amount: 1, unit: 'kg', category: '蔬菜类', isOptional: false },
    { name: '土豆', amount: 200, unit: 'g', category: '蔬菜类', isOptional: true },
  ] }]]);
  eq('土豆分成必买和可选两行',
    buildShoppingList(oneDay, recipes, 2, []).items.filter((i) => i.name === '土豆')
      .map((i) => [i.qty, i.unit, i.isOptional]),
    [[1, 'kg', false], [200, 'g', true]]);

  // 主食和菜谱里同名食材合并
  const r3 = new Map([[10, { name: 'A', servings: 4, ingredients: [
    { name: '意面', amount: 150, unit: 'g', category: '干货粮油', isOptional: false },
  ] }]]);
  eq('150g + 200g = 350g 意面',
    buildShoppingList(oneDay, r3, 2, [{ name: '意面', unit: 'g', category: '干货粮油', qty: 200, amountPerPerson: 100, meals: 1 }])
      .items.filter((i) => i.name === '意面').map((i) => [i.qty, i.unit]),
    [[350, 'g']]);

  return done();
}
