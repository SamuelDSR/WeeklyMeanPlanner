import { makeSuite } from './helpers.mjs';
import { parseAmount, sumByCurrency, groupSums, roundMoney, currencyDecimals } from '../src/money.js';

export default function run() {
  const { eq, done } = makeSuite('money');

  // 金额解析：法语键盘打出来是逗号
  eq('普通小数', parseAmount('12.50'), 12.5);
  eq('法语逗号小数', parseAmount('12,50'), 12.5);
  eq('带空格千分位', parseAmount('1 234,56'), 1234.56);
  eq('负数（退款）', parseAmount('-9.99'), -9.99);
  eq('四舍五入到分', parseAmount('3.456'), 3.46);
  eq('日元没有小数', parseAmount('1234.7', 'JPY'), 1235);
  eq('空 -> null', parseAmount(''), null);
  eq('乱输入 -> null', parseAmount('十二块'), null);
  eq('注入尝试 -> null', parseAmount('1;DROP TABLE'), null);
  eq('超大 -> null', parseAmount('9999999999999'), null);

  // 不同货币绝不相加
  const rows = [{ amount: 10, currency: 'EUR' }, { amount: 5, currency: 'EUR' }, { amount: 100, currency: 'CHF' }];
  eq('按货币分开合计', sumByCurrency(rows), [
    { currency: 'CHF', total: 100, count: 1 },
    { currency: 'EUR', total: 15, count: 2 },
  ]);
  eq('缺 currency 当 EUR', sumByCurrency([{ amount: 3 }]), [{ currency: 'EUR', total: 3, count: 1 }]);
  eq('金额相同时顺序稳定', sumByCurrency([{ amount: 50, currency: 'EUR' }, { amount: 50, currency: 'CHF' }])[0].currency, 'CHF');

  // 浮点累加不许出现 0.30000000000000004
  eq('0.1+0.2', sumByCurrency([{ amount: 0.1, currency: 'EUR' }, { amount: 0.2, currency: 'EUR' }])[0].total, 0.3);
  eq('300 个 0.01', sumByCurrency(Array(300).fill({ amount: 0.01, currency: 'EUR' }))[0].total, 3);

  // 子账本分组
  const ex = [
    { amount: 20, currency: 'EUR', ledger_id: 1 }, { amount: 30, currency: 'EUR', ledger_id: 1 },
    { amount: 7, currency: 'EUR', ledger_id: null }, { amount: 50, currency: 'CHF', ledger_id: 1 },
  ];
  const g = groupSums(ex, (r) => r.ledger_id, 'daily');
  eq('子账本两种货币各自合计', g['1'].totals, [
    { currency: 'CHF', total: 50, count: 1 }, { currency: 'EUR', total: 50, count: 2 },
  ]);
  eq('没挂账本的归日常', g.daily.totals, [{ currency: 'EUR', total: 7, count: 1 }]);

  eq('EUR 2 位', currencyDecimals('EUR'), 2);
  eq('JPY 0 位', currencyDecimals('JPY'), 0);
  eq('没听过的货币按 2 位', currencyDecimals('XYZ'), 2);
  eq('roundMoney JPY', roundMoney(10.6, 'JPY'), 11);

  return done();
}
