import { api } from './api';

export function updateDisplayName(displayName) {
  return api.patch('/auth/me', { displayName });
}
