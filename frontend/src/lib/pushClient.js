// 浏览器端的推送订阅。
//
// 平台差异（很重要）：
//   Android Chrome/Firefox、桌面浏览器 —— 普通标签页里就能订阅
//   iOS/iPadOS 16.4+ —— **必须先"添加到主屏幕"**，在 Safari 标签页里 PushManager 根本不存在
import { api } from './api';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iOS 上判断是不是已经装成主屏应用（没装就订阅不了）
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function permission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

// VAPID 公钥是 base64url，PushManager 要的是 Uint8Array
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function readyRegistration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await readyRegistration();
  return reg.pushManager.getSubscription();
}

// 在这台设备上开启通知：要权限 -> 订阅 -> 把订阅发给服务端
export async function enablePush() {
  if (!pushSupported()) throw new Error('这个浏览器不支持推送通知');

  const granted = await Notification.requestPermission();
  if (granted !== 'granted') throw new Error('通知权限没有被允许');

  const { publicKey } = await api.get('/push/key');
  const reg = await readyRegistration();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // 浏览器要求：每条推送都必须给用户看得见的通知
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const raw = sub.toJSON();
  await api.post('/push/subscribe', { endpoint: raw.endpoint, keys: raw.keys });
  return sub;
}

// 只关这台设备
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.delete('/push/subscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function sendTestPush() {
  return api.post('/push/test');
}
