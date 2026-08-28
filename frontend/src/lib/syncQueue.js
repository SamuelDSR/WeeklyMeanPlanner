// 离线写队列。
//
// 自建后端没有 Firestore 那种自动同步，这里自己做一个小的。原则只有一条：
//
//   **只排队"追加"，不排队"修改"。**
//
// 追加（记一笔开销、勾一项购物清单）离线攒着、联网补发永远是对的：
// 两个人各记各的，谁也不覆盖谁。
// 而修改（改菜谱、调菜单）离线攒着就危险了 —— 你在地铁里改了菜谱，
// 家里人同时也改了，等你联网补发就会无声地把对方的改动盖掉。
// 那种冲突没有安全的自动解法，所以这些操作干脆要求联网，离线时直接告诉用户。
//
// 两个保证：
//   幂等  每条操作带一个客户端生成的 id，服务器认这个 id，重发不会记两笔
//   有序  按入队顺序发，失败就停在那儿，不跳过
import { api } from './api';
import { dedupeQueue, classifyFailure, MAX_ATTEMPTS } from './syncPolicy';

const STORAGE_KEY = 'meal-planner:sync-queue';
const FAILED_KEY = 'meal-planner:sync-failed';

// crypto.randomUUID 只在安全上下文里有；明文 http 下要有退路
function newOpId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // 往下走
  }
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function write(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // 存不下：宁可丢掉这次离线操作，也不能让界面卡住
  }
}

// ---------- 订阅（给界面显示「N 条待同步」）----------
const listeners = new Set();
function notify() {
  const snapshot = { pending: read(STORAGE_KEY).length, failed: read(FAILED_KEY) };
  listeners.forEach((fn) => fn(snapshot));
}
export function subscribeSync(fn) {
  listeners.add(fn);
  fn({ pending: read(STORAGE_KEY).length, failed: read(FAILED_KEY) });
  return () => listeners.delete(fn);
}

export function pendingCount() {
  return read(STORAGE_KEY).length;
}

export function failedOps() {
  return read(FAILED_KEY);
}

export function clearFailed() {
  write(FAILED_KEY, []);
  notify();
}

// ---------- 每种操作怎么发 ----------
// 加新类型的时候先问一句：它是"追加"吗？不是就别放进来。
const SENDERS = {
  'expense.create': (payload, opId) => api.post('/expenses', { ...payload, clientOpId: opId }),
  // 用显式设置而不是 toggle —— 翻转重发一次就翻回去了
  'shopping.setChecked': (payload) =>
    api.patch(`/shopping/item/${payload.itemId}`, { checked: payload.checked }),
};

export function enqueue(type, payload) {
  if (!SENDERS[type]) throw new Error(`未知的同步操作类型：${type}`);
  const deduped = dedupeQueue(read(STORAGE_KEY), type, payload);
  deduped.push({ opId: newOpId(), type, payload, attempts: 0, queuedAt: Date.now() });
  write(STORAGE_KEY, deduped);
  notify();
}

let flushing = false;

// 把队列里的操作依次补发。返回这次发成功了几条。
export async function flushQueue() {
  if (flushing) return 0;
  const queue = read(STORAGE_KEY);
  if (queue.length === 0) return 0;

  flushing = true;
  let sent = 0;
  const failed = read(FAILED_KEY);

  try {
    while (true) {
      const current = read(STORAGE_KEY);
      if (current.length === 0) break;
      const op = current[0];

      try {
        await SENDERS[op.type](op.payload, op.opId);
        write(STORAGE_KEY, current.slice(1));
        sent += 1;
      } catch (err) {
        const verdict = classifyFailure(err, op.attempts || 0);
        if (verdict === 'retry') {
          // 断网 / 5xx：记一次尝试，停在队首等下一轮（不跳过，保持顺序）
          write(STORAGE_KEY, [{ ...op, attempts: (op.attempts || 0) + 1 }, ...current.slice(1)]);
          break;
        }
        // drop / fail：这条发不出去了，挑到失败列表里让用户看见，
        // 队列继续往下走 —— 一条坏数据不该把后面所有的都堵死
        failed.push({
          ...op,
          error: err?.message || (verdict === 'fail' ? '多次重试都失败' : '服务器拒绝了'),
          failedAt: Date.now(),
        });
        write(FAILED_KEY, failed);
        write(STORAGE_KEY, current.slice(1));
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return sent;
}

// 什么时候补发：联网了、页面重新回到前台、以及应用启动时。
// 只挂一次，多处调用不会重复注册。
let installed = false;
export function installSyncTriggers() {
  if (installed) return;
  installed = true;
  const tryFlush = () => {
    if (navigator.onLine !== false) flushQueue();
  };
  window.addEventListener('online', tryFlush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryFlush();
  });
  tryFlush();
}
