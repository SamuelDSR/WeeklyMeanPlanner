// 用轮询代替实时推送：简单很多，几秒延迟在这个应用的场景里完全够用，
// 再加上"窗口重新获得焦点时立刻刷新一次"，日常使用基本感觉不到延迟。
const POLL_INTERVAL = 8000;

// options.getVersion：给"本地刚改过"的页面用。
// 每次本地改动让版本号 +1，这里在请求前后各读一次：不一样就说明这份数据已经过时，丢掉。
//
// 不加这个守卫会有个很难查的 bug：原生 <select> 弹开再收起会触发 window focus，
// 于是轮询立刻发一个请求（拿的是旧数据），而它可能在你的改动保存完之后才返回，
// 把刚加的菜又覆盖回去 —— 表现就是"改完要刷新页面才看得到"。
export function poll(fetchFn, callback, options = POLL_INTERVAL) {
  const { interval = POLL_INTERVAL, getVersion } =
    typeof options === 'number' ? { interval: options } : options || {};

  let cancelled = false;
  let timer;

  async function tick() {
    const versionAtStart = getVersion?.();
    try {
      const data = await fetchFn();
      if (cancelled) return;
      if (getVersion && getVersion() !== versionAtStart) return; // 本地已经更新过，别覆盖
      callback(data);
    } catch (e) {
      // 网络错误时静默失败，保留界面上上一次拿到的数据（离线时的降级体验）
      console.warn('刷新数据失败，可能处于离线状态：', e.message);
    }
    if (!cancelled) timer = setTimeout(tick, interval);
  }

  tick();

  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    window.removeEventListener('focus', tick);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
