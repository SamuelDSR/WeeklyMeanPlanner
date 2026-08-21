// 管理员后台的接口调用都集中在这里
import { api } from './api';
import { poll } from './poll';

// 账号列表，返回 { users, pendingCount }
export function subscribeUsers(callback) {
  return poll(() => api.get('/admin/users'), callback);
}

export async function fetchUsers() {
  return api.get('/admin/users');
}

export async function approveUser(userId) {
  return api.post(`/admin/users/${userId}/approve`);
}

export async function rejectUser(userId) {
  return api.post(`/admin/users/${userId}/reject`);
}

export async function setUserAdmin(userId, isAdmin) {
  return api.post(`/admin/users/${userId}/admin`, { isAdmin });
}

export async function deleteUser(userId) {
  return api.delete(`/admin/users/${userId}`);
}
