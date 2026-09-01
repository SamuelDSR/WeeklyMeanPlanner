// 所有对后端 REST API 的请求都走这里
// 用 cookie 存 JWT，所以每个请求都要带 credentials: 'include'

import { tGlobal } from '../i18n/translate';
import { markReachable, markUnreachable } from './reachability';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    // fetch 本身抛错 = 真的没连上（HTTP 4xx/5xx 不会走到这里）
    markUnreachable();
    throw err;
  }

  // 谁的「成功」能算数？
  //
  // 断网时 Service Worker 会拿缓存顶上，那也是 200 —— 拿它当在线就错了。
  // 试过让 SW 给缓存响应打个头再由这里识别，实测那个头到不了页面，
  // 所以改用一条更硬的规则：**只有从不进缓存的接口才作数**。
  // /api/auth/* 明确不在 sw.js 的缓存白名单里（登录状态不该来自缓存），
  // 它答话了就说明真的够得着服务器。
  //
  // 失败那一侧不用挑：fetch 抛错就是真没连上，已经在上面 catch 里报过了。
  if (path.startsWith('/auth/')) markReachable();

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
