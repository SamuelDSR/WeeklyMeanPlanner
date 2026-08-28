// 记账键盘的加减。前端的模块，但纯函数，放这里一起跑。
import { makeSuite } from './helpers.mjs';
import { evaluateExpression, hasOperator, pressKey } from '../../frontend/src/lib/expenseCalc.js';

export default function run() {
  const { eq, done } = makeSuite('记账键盘');

  eq('21+35', evaluateExpression('21+35'), 56);
  eq('带小数', evaluateExpression('12.50+3.20'), 15.7);
  eq('连加', evaluateExpression('1+2+3+4'), 10);
  eq('减法', evaluateExpression('100-35.5'), 64.5);
  eq('加减混合', evaluateExpression('20+5-3'), 22);
  eq('单个数', evaluateExpression('42'), 42);
  eq('逗号当小数点', evaluateExpression('12,50'), 12.5);
  eq('负数开头', evaluateExpression('-5+8'), 3);
  eq('浮点收敛 0.1+0.2', evaluateExpression('0.1+0.2'), 0.3);

  eq('空 -> null', evaluateExpression(''), null);
  eq('以运算符结尾 -> null', evaluateExpression('12+'), null);
  eq('两个运算符 -> null', evaluateExpression('12++3'), null);
  eq('两个小数点 -> null', evaluateExpression('1.2.3'), null);
  eq('字母 -> null', evaluateExpression('12a'), null);
  eq('不执行代码', evaluateExpression('1+1;alert(1)'), null);
  eq('不认乘除', evaluateExpression('2*3'), null);
  eq('超大 -> null', evaluateExpression('9999999999+1'), null);

  eq('有运算符', hasOperator('21+35'), true);
  eq('没运算符', hasOperator('2135'), false);
  eq('负号开头不算', hasOperator('-35'), false);

  // 按键：能不能按的判断都在 pressKey 里
  eq('依次按 2 1', pressKey(pressKey('', '2'), '1'), '21');
  eq('开头按 + 无效', pressKey('', '+'), '');
  eq('开头按 - 可以', pressKey('', '-'), '-');
  eq('末尾运算符被替换', pressKey('12+', '-'), '12-');
  eq('开头按小数点补 0', pressKey('', '.'), '0.');
  eq('运算符后按小数点补 0', pressKey('12+', '.'), '12+0.');
  eq('一个数里第二个小数点被吞', pressKey('1.5', '.'), '1.5');
  eq('小数点后第三位被拦', pressKey('1.55', '9'), '1.55');
  eq('第二段数字可以有自己的小数点', pressKey('1.5+2', '.'), '1.5+2.');
  eq('前导零被替换', pressKey('0', '5'), '5');
  eq('退格', pressKey('123', 'back'), '12');
  eq('清空', pressKey('123', 'clear'), '');

  return done();
}
