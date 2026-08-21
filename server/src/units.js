// 单位表与换算。
//
// 同一个「量纲」里的单位可以相加，合并后用「用到过的最小单位」显示：
//
//   1 kg 土豆 + 200 g 土豆   ->  1200 g 土豆    （最小单位是 g）
//   2 kg 米   + 3 kg 米      ->  5 kg 米        （都是 kg，就还用 kg，不会变成 5000 g）
//
// 数量类单位（个 / 只 / 片…）彼此换算不了（1 只 ≠ 1 个），
// 「适量 / 少许」这类也没有数值，所以它们只在单位完全相同时才合并 —— 和原来的行为一致。

// 能互相换算的单位组：值是「1 个该单位等于多少基准单位」
const CONVERTIBLE_GROUPS = [
  {
    dimension: 'mass', // 基准：g
    units: {
      mg: 0.001, 毫克: 0.001,
      g: 1, 克: 1, 公克: 1,
      两: 50,
      斤: 500,
      kg: 1000, 公斤: 1000, 千克: 1000,
      oz: 28.3495, 盎司: 28.3495,
      lb: 453.592, 磅: 453.592,
    },
  },
  {
    dimension: 'volume', // 基准：ml
    units: {
      ml: 1, 毫升: 1, cc: 1,
      cl: 10, dl: 100,
      L: 1000, 升: 1000, 公升: 1000,
    },
  },
];

// 查表用的索引：单位字符串（小写去空格）-> { dimension, factor, display }
// display 是规范写法：用户打成 'G' / ' KG ' 也会显示成 g / kg，
// 但中文写法（克 / 斤）保持中文，不去动用户的语言习惯。
const UNIT_INDEX = new Map();
for (const { dimension, units } of CONVERTIBLE_GROUPS) {
  for (const [unit, factor] of Object.entries(units)) {
    UNIT_INDEX.set(unit.toLowerCase(), { dimension, factor, display: unit });
  }
}

// 传进来的单位能不能参与换算；不认识的返回 null（按原样、只跟同名的合并）
export function lookupUnit(unit) {
  if (typeof unit !== 'string') return null;
  const key = unit.trim().toLowerCase();
  if (!key) return null;
  return UNIT_INDEX.get(key) || null;
}

// 给表单下拉框用的单位列表。
// 这里是「推荐用哪些」，故意比上面的换算表短：
// 克/毫升/公斤 这些中文写法仍然认得（老数据照样能合并），只是不摆进下拉框里凑数。
export const UNIT_OPTIONS = [
  { group: '质量', units: ['g', 'kg', '斤', '两'] },
  { group: '体积', units: ['ml', 'L'] },
  { group: '数量', units: ['个', '只', '颗', '根', '片', '块', '条', '瓣', '把', '张'] },
  { group: '容器 / 器具', units: ['勺', '汤匙', '茶匙', '杯', '瓶', '罐', '盒', '袋', '包'] },
  { group: '不计量', units: ['适量', '少许'] },
];

// 浮点累加会出现 0.30000000000000004 这种，统一收一下精度
export function roundQty(value) {
  return Math.round(value * 1000) / 1000;
}
