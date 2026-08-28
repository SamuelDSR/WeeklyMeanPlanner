// 离线队列里最容易出错的两处判断。前端模块，但都是纯函数。
//
// 这两个函数决定「用户离线记的东西会不会被悄悄丢掉」，值得单独测。
import { makeSuite } from './helpers.mjs';
import { dedupeQueue, classifyFailure } from '../../frontend/src/lib/syncPolicy.js';

export default function run() {
  const { eq, done } = makeSuite('离线队列');

  // 购物清单勾选：同一项只留最后一次的目标状态
  const q = [
    { type: 'shopping.setChecked', payload: { itemId: 1, checked: true } },
    { type: 'expense.create', payload: { amount: '10' } },
    { type: 'shopping.setChecked', payload: { itemId: 2, checked: true } },
  ];
  eq('同一项再勾一次，旧的被顶掉',
    dedupeQueue(q, 'shopping.setChecked', { itemId: 1, checked: false }).map((o) => o.payload.itemId ?? 'exp'),
    ['exp', 2]);
  eq('不同项互不影响',
    dedupeQueue(q, 'shopping.setChecked', { itemId: 9, checked: true }).length, 3);
  eq('记账绝不去重（两笔一样的钱是两笔真账）',
    dedupeQueue(q, 'expense.create', { amount: '10' }).length, 3);

  // 失败分类
  eq('400 不合法 -> 丢掉并告诉用户', classifyFailure({ status: 400 }, 0), 'drop');
  eq('404 东西没了 -> 丢掉', classifyFailure({ status: 404 }, 0), 'drop');
  eq('403 没权限 -> 丢掉', classifyFailure({ status: 403 }, 0), 'drop');
  eq('500 服务器炸了 -> 重试', classifyFailure({ status: 500 }, 0), 'retry');
  eq('断网（没有 status）-> 重试', classifyFailure(new TypeError('Failed to fetch'), 0), 'retry');
  eq('重试到上限 -> 标记失败', classifyFailure(new TypeError('x'), 4, 5), 'fail');
  eq('还没到上限 -> 继续重试', classifyFailure(new TypeError('x'), 3, 5), 'retry');
  eq('4xx 即使次数没到也直接丢', classifyFailure({ status: 422 }, 0, 5), 'drop');

  return done();
}
