// 离线队列的两条判断规则。
//
// 单独放一个文件、不 import 任何东西，是为了能直接测 —— 这两个函数决定
// 「用户离线记下的东西会不会被悄悄丢掉」，是整个离线能力里最该有测试的地方。
export const MAX_ATTEMPTS = 5;

// 入队前去重：同一项购物清单反复勾选，只留最后一次的目标状态。
// 幂等，而且少发好几个请求。
//
// 记账**绝不去重** —— 两笔金额一样的开销是两笔真账，合并掉就是丢钱。
export function dedupeQueue(queue, type, payload) {
  if (type !== 'shopping.setChecked') return queue;
  return queue.filter((op) => !(op.type === type && op.payload.itemId === payload.itemId));
}

// 一次发送失败之后怎么处理这条操作：
//   'drop'  服务器明确拒绝（4xx）—— 再试一万次也一样，挑出来告诉用户
//   'fail'  重试太多次了，同样挑出来
//   'retry' 断网 / 5xx —— 留在队首等下一轮
//
// 关键在于 drop 和 fail 都要**把这条移出队列**：一条坏数据留在队首，
// 会把后面所有正常的操作全堵死，用户永远同步不上去还找不到原因。
export function classifyFailure(err, attempts, maxAttempts = MAX_ATTEMPTS) {
  const status = err?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return 'drop';
  if (attempts + 1 >= maxAttempts) return 'fail';
  return 'retry';
}
