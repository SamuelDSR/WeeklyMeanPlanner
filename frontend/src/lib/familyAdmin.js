// 家庭管理相关的接口调用
import { api } from './api';

// { family, members }
export function fetchFamily() {
  return api.get('/family');
}

export function updateFamily(patch) {
  return api.patch('/family', patch);
}

export function regenerateInviteCode() {
  return api.post('/family/invite-code');
}

export function removeMember(userId) {
  return api.delete(`/family/members/${userId}`);
}

export function transferOwnership(userId) {
  return api.post(`/family/transfer/${userId}`);
}

export function leaveFamily() {
  return api.post('/family/leave');
}
