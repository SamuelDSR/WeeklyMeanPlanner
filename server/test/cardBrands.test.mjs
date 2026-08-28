// 商家预设表的自检。
//
// 这张表以后会不断加店，全是手写的字面量 —— 拼错一个码制、颜色少一位，
// 界面上就是一块空白或者扫不出来的码。这些低级错误交给测试盯着。
import { makeSuite } from './helpers.mjs';
import { CARD_BRANDS, findBrand, isValidBrand } from '../src/cardBrands.js';
import { isValidFormat } from '../src/cardFormats.js';

export default function run() {
  const { eq, done } = makeSuite('商家预设');

  eq('slug 不重复', CARD_BRANDS.length, new Set(CARD_BRANDS.map((b) => b.slug)).size);

  const badFormat = CARD_BRANDS.filter((b) => !isValidFormat(b.format));
  eq('码制都是画得出来的', badFormat.map((b) => `${b.slug}:${b.format}`), []);

  const badColor = CARD_BRANDS.filter((b) => !/^#[0-9A-Fa-f]{6}$/.test(b.color));
  eq('颜色都是 #rrggbb', badColor.map((b) => `${b.slug}:${b.color}`), []);

  const badShort = CARD_BRANDS.filter((b) => !b.short || [...b.short].length > 2);
  eq('首字母最多两个字符', badShort.map((b) => `${b.slug}:${b.short}`), []);

  const groups = ['grocery', 'food', 'home', 'other'];
  const badGroup = CARD_BRANDS.filter((b) => !groups.includes(b.group));
  eq('分组都在已知的四个里', badGroup.map((b) => `${b.slug}:${b.group}`), []);

  const noName = CARD_BRANDS.filter((b) => !b.name?.trim());
  eq('都有名字', noName.length, 0);

  eq('查得到 carrefour', findBrand('carrefour')?.name, 'Carrefour');
  eq('查不到的返回 null', findBrand('不存在'), null);
  eq('校验认识的', isValidBrand('picard'), true);
  eq('校验不认识的', isValidBrand('随便编的'), false);
  eq('非字符串也拒掉', isValidBrand(null), false);

  return done();
}
