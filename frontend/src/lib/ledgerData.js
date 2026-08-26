// 记账的接口调用
import { api } from './api';

// 分类、货币列表、家庭默认货币
export async function fetchLedgerMeta() {
  return api.get('/ledgers/meta');
}

// 总览：子账本列表 + 各自合计 + 按分类合计。month 形如 '2026-08'，不传就是全部。
export async function fetchLedgerOverview(month) {
  return api.get(month ? `/ledgers?month=${month}` : '/ledgers');
}

export async function createLedger(data) {
  return (await api.post('/ledgers', data)).ledger;
}

export async function updateLedger(id, patch) {
  return (await api.patch(`/ledgers/${id}`, patch)).ledger;
}

// 删子账本，里面的开销会回到「日常」，不会被删掉
export async function deleteLedger(id) {
  return api.delete(`/ledgers/${id}`);
}

// filters: { month, ledger: id | 'daily', category, limit }
export async function fetchExpenses(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  });
  const qs = params.toString();
  return api.get(qs ? `/expenses?${qs}` : '/expenses');
}

export async function createExpense(data) {
  return (await api.post('/expenses', data)).expense;
}

export async function updateExpense(id, patch) {
  return (await api.patch(`/expenses/${id}`, patch)).expense;
}

export async function deleteExpense(id) {
  await api.delete(`/expenses/${id}`);
}
