/* eslint-env serviceworker */
// 自己写的 service worker（vite-plugin-pwa 的 injectManifest 模式）。
//
// 为什么不再用自动生成的：自动生成的 SW 没法插入 push / notificationclick 处理，
// 而做饭提醒必须靠这两个事件。缓存策略和之前保持一致（见 vite.config.js 的注释）。
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// 应用外壳（HTML/JS/CSS）：构建时由 injectManifest 填进来
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// 菜品照片：同源 /uploads/，内容不会变，缓存优先
registerRoute(
  ({ url }) => url.pathname.startsWith('/uploads/'),
  new CacheFirst({
    cacheName: 'recipe-photos',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  })
);

// API 数据：先走网络（在线时永远最新），断网或超过 3 秒才用缓存兜底。
// 千万不能用 StaleWhileRevalidate —— 那会先把旧数据塞回界面，
// 刚改完的东西会"消失几秒再回来"。/api/auth 故意不缓存（登录状态）。
registerRoute(
  ({ url }) =>
    /^\/api\/(recipes|menu|shopping|history|family|units)/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'api-data-v2',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  })
);

// 新版本装好后立刻接管（对应 registerType: 'autoUpdate'）
self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// ---------- 做饭提醒 ----------

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text?.() || '' };
  }

  const title = data.title || '食谱管家';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // 同一顿饭的提醒只留一条，不要在通知栏堆一串
    tag: data.mealSlot ? `meal-${data.date}-${data.mealSlot}` : 'meal-planner',
    renotify: false,
    data: { url: data.url || '/menu' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/menu';

  // 已经开着就切过去，没开着才新开一个
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
