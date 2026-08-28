import { makeSuite } from './helpers.mjs';
import { validateCode, ean13CheckDigit } from '../src/cardFormats.js';

export default function run() {
  const { eq, ok, rejects, done } = makeSuite('cardFormats');

  eq('EAN-13 校验位算得对', ean13CheckDigit('400638133393'), 1);
  ok('合法 EAN-13', validateCode('4006381333931', 'EAN13'));
  ok('带空格也认', validateCode('4 006381 333931', 'EAN13'));
  rejects('EAN-13 校验位错', validateCode('4006381333930', 'EAN13'));
  rejects('EAN-13 位数不够', validateCode('400638133393', 'EAN13'));
  rejects('EAN-13 有字母', validateCode('400638133393X', 'EAN13'));

  ok('合法 EAN-8', validateCode('96385074', 'EAN8'));
  rejects('EAN-8 校验位错', validateCode('96385075', 'EAN8'));
  ok('合法 UPC-A', validateCode('036000291452', 'UPC'));
  rejects('UPC 校验位错', validateCode('036000291453', 'UPC'));

  ok('Code128 混合字符', validateCode('ABC-123/456', 'CODE128'));
  rejects('Code128 中文（画不出来）', validateCode('会员卡', 'CODE128'));
  eq('Code39 自动转大写', validateCode('abc-123', 'CODE39').value, 'ABC-123');
  rejects('Code39 非法字符', validateCode('abc@123', 'CODE39'));
  ok('ITF 偶数位', validateCode('12345678', 'ITF'));
  rejects('ITF 奇数位', validateCode('1234567', 'ITF'));

  ok('QR 装网址', validateCode('https://example.com/card/abc', 'QR'));
  ok('QR 装中文', validateCode('会员号：12345', 'QR'));

  rejects('空', validateCode('', 'CODE128'));
  rejects('只有空格', validateCode('   ', 'CODE128'));
  rejects('未知格式', validateCode('123', 'PDF417'));
  rejects('超长', validateCode('x'.repeat(513), 'CODE128'));

  return done();
}
