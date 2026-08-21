// 传统自建后端没有 Firestore 那种"自动离线同步"的能力，
// 这里给购物清单的勾选操作单独做一个轻量级的离线写队列：
// - 勾选时界面先乐观更新（不等网络）
// - 请求失败（大概率是离线）就把这次操作存到 localStorage
// - 联网后（'online' 事件 / 页面重新可见 / 下次打开app）尝试把队列里的操作补发给服务器
//
// 这个队列只做"最后一次操作生效"：同一个 itemId 多次切换只保留最新状态的语义
// （因为 toggle 是"翻转"操作，服务器和本地都用同一套翻转逻辑，最终会收敛到一致状态）

import { api } from './api';

const STORAGE_KEY = 'meal-planner:offline-toggle-queue';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function queueOfflineToggle(itemId) {
  const queue = readQueue();
  queue.push({ itemId, queuedAt: Date.now() });
  writeQueue(queue);
}

let flushing = false;

export async function flushOfflineQueue() {
  if (flushing) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  flushing = true;
  const remaining = [];
  for (const item of queue) {
    try {
      await api.patch(`/shopping/item/${item.itemId}/toggle`);
    } catch {
      remaining.push(item); // 还是失败（可能还没联网），留到下次再试
    }
  }
  writeQueue(remaining);
  flushing = false;
}
