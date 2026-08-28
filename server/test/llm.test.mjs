import { makeSuite } from './helpers.mjs';
import { __test, htmlToText } from '../src/llm/fetchPage.js';
import { normalizeRecipeDraft } from '../src/llm/recipeSchema.js';
import { extractJson } from '../src/llm/client.js';

export default function run() {
  const { eq, done } = makeSuite('llm 导入 + SSRF 防护');

  // SSRF：内网一律拦。URL 解析器会把 [::ffff:127.0.0.1] 规范化成 ::ffff:7f00:1，
  // 所以判断必须展开 IPv6 再抠出内嵌的 IPv4，不能只看字符串前缀。
  ['127.0.0.1', '0.0.0.0', '10.1.2.3', '172.16.0.1', '192.168.0.55', '169.254.169.254',
    '100.64.0.1', '224.0.0.1', '::1', '::', 'fe80::1', 'febf::1', 'fc00::1', 'fd12:3456::1',
    'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '::ffff:c0a8:37',
    '::ffff:a9fe:a9fe', '::7f00:1', 'garbage', '', '1.2.3',
  ].forEach((ip) => eq(`拦住 ${ip}`, __test.isBlockedIp(ip), true));

  ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '11.0.0.1',
    '2606:4700::1111', '2001:4860:4860::8888', 'fe00::1', '::ffff:8.8.8.8', '::ffff:808:808',
  ].forEach((ip) => eq(`放行 ${ip}`, __test.isBlockedIp(ip), false));

  eq('去掉 script', htmlToText('<p>牛肉</p><script>alert(1)</script><p>土豆</p>'), '牛肉\n土豆');
  eq('li 变条目', htmlToText('<ul><li>盐 5g</li><li>糖 10g</li></ul>'), '- 盐 5g\n- 糖 10g');
  eq('实体字符', htmlToText('<p>盐&amp;糖&nbsp;少许</p>'), '盐&糖 少许');

  // 模型输出一律不可信，按自己的枚举清洗
  const dirty = normalizeRecipeDraft({
    name: 'x'.repeat(200), category: '不存在的分类', meals: ['早餐', '夜宵', '午餐', '午餐'],
    timeMinutes: -5, servings: 0, tags: Array(20).fill('t'),
    ingredients: [
      { name: '土豆', amount: '1.5', unit: 'KG', category: '蔬菜类', isOptional: 'yes' },
      { name: '香菜', amount: 10, unit: 'g', category: '伪造分类', isOptional: true },
      { name: '', amount: 1, unit: 'g' },
      ...Array(100).fill({ name: '凑数', amount: 1, unit: 'g', category: '其他' }),
    ],
    steps: [{ content: '炒', timerSeconds: -9 }, { title: 't', content: '' }, ...Array(80).fill({ content: '凑数' })],
  });
  eq('菜名截断到 80', dirty.name.length, 80);
  eq('乱分类落到默认', dirty.category, '蔬菜');
  eq('早餐/夜宵都不是合法餐次', dirty.meals, ['午餐']);
  eq('全非法餐次时兜底成晚餐',
    normalizeRecipeDraft({ name: 'a', meals: ['早餐'], ingredients: [], steps: [] }).meals, ['晚餐']);
  eq('负数耗时 -> 0', dirty.timeMinutes, 0);
  eq('servings 至少 1', dirty.servings, 1);
  eq('tags 最多 6', dirty.tags.length, 6);
  eq('KG 规范成 kg', dirty.ingredients[0].unit, 'kg');
  eq('字符串 amount 转数字', dirty.ingredients[0].amount, 1.5);
  eq("isOptional 只认真正的 true", dirty.ingredients[0].isOptional, false);
  eq('食材乱分类 -> 其他', dirty.ingredients[1].category, '其他');
  eq('先剔垃圾再截断到 60', dirty.ingredients.length, 60);
  eq('负数计时 -> 0', dirty.steps[0].timerSeconds, 0);
  eq('步骤上限 40', dirty.steps.length, 40);
  eq('未知单位原样保留',
    normalizeRecipeDraft({ name: 'a', ingredients: [{ name: '盐', amount: 1, unit: '撮' }], steps: [] }).ingredients[0].unit, '撮');

  eq('带 ``` 围栏', extractJson('```json\n{"a":1}\n```').a, 1);
  eq('前后有解释文字', extractJson('好的，结果是：{"a":2} 希望有帮助').a, 2);
  eq('纯 JSON', extractJson('{"a":3}').a, 3);

  return done();
}
