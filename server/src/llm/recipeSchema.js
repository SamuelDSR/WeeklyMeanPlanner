// 菜谱解析的输出结构 + 清洗。
//
// **模型返回的东西一律不可信**：它会编出不存在的分类、把用量写成 "一小把"、
// 返回 200 个步骤。所以这里做两件事：
//   1. schema 交给模型，尽量让它一次就输出对的形状
//   2. 回来之后再按我们自己的枚举清洗一遍，凡是不认识的都落到安全的默认值
//
// 清洗后的结果只是「填进表单里的草稿」，用户还要自己看一眼再保存。
import { UNIT_OPTIONS } from '../units.js';

export const RECIPE_CATEGORIES = ['蔬菜', '水果', '肉类', '鱼类', '蛋奶豆制品', '主食', '汤羹'];
export const MEALS = ['午餐', '晚餐'];
export const ING_CATEGORIES = ['蔬菜类', '水果类', '肉禽类', '水产类', '蛋奶类', '干货粮油', '调料', '其他'];

const SUGGESTED_UNITS = UNIT_OPTIONS.flatMap((g) => g.units);

const MAX_INGREDIENTS = 60;
const MAX_STEPS = 40;
const MAX_NAME = 80;
const MAX_TEXT = 2000;

export const RECIPE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '菜名。原文是外文的话，翻译成中文，并在 tags 里保留原名' },
    category: { type: 'string', enum: RECIPE_CATEGORIES, description: '这道菜的主要food分类' },
    meals: {
      type: 'array',
      items: { type: 'string', enum: MEALS },
      description: '适合哪几餐吃',
    },
    timeMinutes: { type: 'integer', description: '总耗时（分钟），估算即可' },
    servings: { type: 'integer', description: '这一份做出来够几个人吃' },
    tags: { type: 'array', items: { type: 'string' }, description: '菜系、原文菜名、特点等，最多 6 个' },
    ingredients: {
      type: 'array',
      description: '食材清单',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'number', description: '数量。原文没写就估一个' },
          unit: { type: 'string', description: `单位，尽量用这些：${SUGGESTED_UNITS.join(' ')}` },
          category: { type: 'string', enum: ING_CATEGORIES },
          isOptional: {
            type: 'boolean',
            description: '原文标了「可选 / optional / facultatif」，或者只是点缀（香菜、装饰用的），就是 true',
          },
        },
        required: ['name', 'amount', 'unit', 'category'],
      },
    },
    steps: {
      type: 'array',
      description: '做法步骤，按顺序',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '这一步的短标题，比如「炒香底料」' },
          content: { type: 'string', description: '这一步具体怎么做' },
          timerSeconds: { type: 'integer', description: '这一步要计时多少秒，没有就 0' },
        },
        required: ['content'],
      },
    },
  },
  required: ['name', 'ingredients', 'steps'],
};

export const SYSTEM_PROMPT = `你是一个帮忙录入家庭菜谱的助手。
用户会给你一段菜谱原文（可能是中文、英文或法文，可能是从网页复制的、带着导航栏和广告的杂乱文本）。
请从里面提取出结构化的菜谱信息。

要求：
- 只提取真正属于这道菜的内容，忽略网页上的导航、评论、广告、推荐阅读。
- 菜名用中文。如果原文是外文，把原名放进 tags。
- 用量统一换算成公制（g / ml / 个 这类）。原文写「1 cup flour」就换成 120 g 左右。
- 原文明确写了「可选 / optional / facultatif / 依个人口味」的食材，isOptional 设成 true。
  只用来点缀装饰的（香菜叶、白芝麻）也算可选。
- 步骤要拆开，一步一件事，别把整段话塞进一个步骤。
- 拿不准的字段就按常识估一个合理值，不要留空。
- 如果这段文本里根本没有菜谱，把 name 设成空字符串。`;

function clampString(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function pickEnum(value, allowed, fallback) {
  const v = String(value ?? '').trim();
  return allowed.includes(v) ? v : fallback;
}

function cleanNumber(value, { min = 0, max = 1e6, fallback = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// 单位：认识的就规范化，不认识的原样留着（表单里会补一个 option，不会被悄悄清掉）
function cleanUnit(value) {
  const unit = clampString(value, 10);
  if (!unit) return '';
  const match = SUGGESTED_UNITS.find((u) => u.toLowerCase() === unit.toLowerCase());
  return match || unit;
}

export function normalizeRecipeDraft(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};

  // 先 filter 再 slice：上限的含义是「60 条有效食材」，
  // 不能让模型塞几个空条目就把真的挤出去
  const ingredients = (Array.isArray(src.ingredients) ? src.ingredients : [])
    .map((i) => ({
      name: clampString(i?.name, MAX_NAME),
      amount: cleanNumber(i?.amount, { min: 0, max: 100000, fallback: 0 }),
      unit: cleanUnit(i?.unit),
      category: pickEnum(i?.category, ING_CATEGORIES, '其他'),
      isOptional: i?.isOptional === true,
    }))
    .filter((i) => i.name)
    .slice(0, MAX_INGREDIENTS);

  const steps = (Array.isArray(src.steps) ? src.steps : [])
    .map((s) => ({
      title: clampString(s?.title, MAX_NAME),
      content: clampString(s?.content, MAX_TEXT),
      timerSeconds: Math.round(cleanNumber(s?.timerSeconds, { min: 0, max: 86400, fallback: 0 })),
    }))
    .filter((s) => s.content)
    .slice(0, MAX_STEPS);

  const meals = (Array.isArray(src.meals) ? src.meals : [])
    .map((m) => pickEnum(m, MEALS, null))
    .filter(Boolean);

  return {
    name: clampString(src.name, MAX_NAME),
    category: pickEnum(src.category, RECIPE_CATEGORIES, '蔬菜'),
    meals: meals.length > 0 ? Array.from(new Set(meals)) : ['晚餐'],
    timeMinutes: Math.round(cleanNumber(src.timeMinutes, { min: 0, max: 6000, fallback: 30 })),
    servings: Math.max(1, Math.round(cleanNumber(src.servings, { min: 1, max: 100, fallback: 4 }))),
    tags: (Array.isArray(src.tags) ? src.tags : [])
      .slice(0, 6)
      .map((tg) => clampString(tg, 30))
      .filter(Boolean),
    ingredients,
    steps,
  };
}
