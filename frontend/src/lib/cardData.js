// 会员卡的接口调用
import { api } from './api';

export async function fetchCards() {
  return (await api.get('/cards')).cards;
}

// 码格式和可选颜色（静态列表，取一次就够）
export async function fetchCardMeta() {
  return api.get('/cards/formats');
}

export async function createCard(data) {
  return (await api.post('/cards', data)).card;
}

export async function updateCard(id, patch) {
  return (await api.patch(`/cards/${id}`, patch)).card;
}

export async function deleteCard(id) {
  await api.delete(`/cards/${id}`);
}

export async function reorderCards(ids) {
  return (await api.patch('/cards/order', { ids })).cards;
}
