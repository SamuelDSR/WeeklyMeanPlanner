// 「够不着服务器」这件事的唯一真相来源。
//
// 之前是 AuthContext 在挂载时问一次 /auth/me，失败就把 offline 置成 true，
// 而且**只有那一次请求**能把它改回来 —— iOS 上把应用装到桌面后冷启动，
// 网络栈往往还没就绪，第一次请求必然失败，于是提示条就永远挂在那儿了。
//
// 现在改成：**每一个请求**都上报结果，谁成功都能把状态拨回在线。
// 应用本来每 8 秒就会轮询一次，所以最多几秒就自愈。
let reachable = true;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(reachable));
}

export function isReachable() {
  return reachable;
}

export function markReachable() {
  if (reachable) return;
  reachable = true;
  emit();
}

export function markUnreachable() {
  if (!reachable) return;
  reachable = false;
  emit();
}

export function subscribeReachability(fn) {
  listeners.add(fn);
  fn(reachable);
  return () => listeners.delete(fn);
}
