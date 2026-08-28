// 开销分类。
//
// 分类是**数据**（存在 expenses.category，中文），显示时才翻译 —— 和菜品分类一个规矩。
// icon 是给前端查 lucide 图标用的名字：分类多了之后，一格一个图标比一列文字好认得多。
//
// 收入和支出各有一套：把「工资」和「餐饮」混在一个列表里，选起来纯属受罪。

export const EXPENSE_CATEGORIES = [
  { value: '餐饮', icon: 'Utensils' },
  { value: '食材', icon: 'Carrot' },
  { value: '日用', icon: 'PackageOpen' },
  { value: '购物', icon: 'ShoppingBag' },
  { value: '服饰', icon: 'Shirt' },
  { value: '交通', icon: 'Bus' },
  { value: '住房', icon: 'Home' },
  { value: '居家', icon: 'Sofa' },
  { value: '娱乐', icon: 'Clapperboard' },
  { value: '运动', icon: 'Bike' },
  { value: '通讯', icon: 'Smartphone' },
  { value: '医疗', icon: 'HeartPulse' },
  { value: '孩子', icon: 'Baby' },
  { value: '长辈', icon: 'Users' },
  { value: '人情', icon: 'Gift' },
  { value: '旅行', icon: 'Plane' },
  { value: '学习', icon: 'GraduationCap' },
  { value: '其他', icon: 'CircleEllipsis' },
];

export const INCOME_CATEGORIES = [
  { value: '工资', icon: 'Wallet' },
  { value: '奖金', icon: 'Award' },
  { value: '兼职', icon: 'Briefcase' },
  { value: '投资', icon: 'TrendingUp' },
  { value: '红包', icon: 'Gift' },
  { value: '报销', icon: 'Receipt' },
  { value: '退款', icon: 'Undo2' },
  { value: '其他', icon: 'CircleEllipsis' },
];

export const KINDS = ['expense', 'income'];

const EXPENSE_VALUES = EXPENSE_CATEGORIES.map((c) => c.value);
const INCOME_VALUES = INCOME_CATEGORIES.map((c) => c.value);

export function isValidKind(kind) {
  return KINDS.includes(kind);
}

// 分类要和收/支对得上：'工资' 记成支出、'餐饮' 记成收入都是填错了。
// 「其他」两边都有，所以两边都认。
export function isValidCategory(category, kind = 'expense') {
  const list = kind === 'income' ? INCOME_VALUES : EXPENSE_VALUES;
  return list.includes(category);
}

export function categoriesFor(kind) {
  return kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

// 老数据里可能有现在列表里没有的分类（比如 013 时期的「住宿」）。
// 汇总时不能因此丢行 —— 落到「其他」而不是报错。
export function normalizeCategory(category, kind = 'expense') {
  return isValidCategory(category, kind) ? category : '其他';
}
