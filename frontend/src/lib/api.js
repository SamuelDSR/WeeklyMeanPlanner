// 所有对后端 REST API 的请求都走这里
// 用 cookie 存 JWT，所以每个请求都要带 credentials: 'include'

import { tGlobal } from '../i18n/translate';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // 有些接口（比如 204）没有响应体
  }

  if (!res.ok) {
    throw new ApiError(data?.error || tGlobal('common.requestFailed', { status: res.status }), res.status);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: (path, body) => request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  // DELETE 也允许带 body：取消推送订阅时要把 endpoint 传上去
  delete: (path, body) =>
    request(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData }),
};

export { ApiError };
