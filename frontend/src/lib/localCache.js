// 「上次拿到的好数据」本地留一份。
//
// Service Worker 的 HTTP 缓存已经能兜住大部分读取，但有两个地方不够：
//   1. NetworkFirst 断网时要等超时（3 秒）才回退到缓存 —— 站在收银台前太久了
//   2. 缓存桶可能被浏览器回收，而会员卡是「必须能打开」的东西
//
// 所以关键数据在应用层再存一份：打开就先用本地这份画出来，同时去后台刷新。
const PREFIX = 'meal-planner:cache:';

export function readCache(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed?.data ?? fallback;
  } catch {
    return fallback;
  }
}

export function cacheMeta(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.savedAt ? { savedAt: parsed.savedAt } : null;
  } catch {
    return null;
  }
}

export function writeCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // 空间满了或隐私模式：存不下就算了，退回纯网络那条路
  }
}

export function clearCache(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // 同上
  }
}

// 退出登录时把所有本地缓存清掉 —— 换个人登录不该看到上一个人的数据
export function clearAllCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // 同上
  }
}

// 这次失败是"网络不通"还是"服务器说不行"？
//
// 两者要区别对待：401 该退出登录，断网**不该** —— cookie 还是好的，
// 只是暂时够不着服务器。把断网当成未登录，用户在地铁里打开应用就被踢到登录页了。
export function isNetworkError(err) {
  // api.js 里 HTTP 错误会带 status；fetch 本身失败抛的是 TypeError，没有 status
  return !err || typeof err.status !== 'number';
}
