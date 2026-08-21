import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { USER_STATUS, statusMessage } from './userStatus.js';

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'token';
const TOKEN_TTL = '30d';

if (!JWT_SECRET) {
  throw new Error('缺少 JWT_SECRET 环境变量，请在 .env 里设置一个随机字符串');
}

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function setAuthCookie(res, token) {
  const secure = process.env.COOKIE_SECURE !== 'false'; // 默认 true，本地无 https 调试时可设成 false
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// 中间件：要求已登录，把 req.user = { userId, familyId, isAdmin } 挂上去
//
// token 只用来确认"你是谁"，权限和状态一律回库里现查：
// JWT 签发后没法主动作废，如果只信 token 里的内容，管理员把一个账号改成"拒绝"之后，
// 它手上那个 30 天有效期的 cookie 还能继续用。
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: '请先登录' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  const result = await query(
    'SELECT id, family_id, status, is_admin FROM users WHERE id = $1',
    [payload.userId]
  );
  const user = result.rows[0];

  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: '账号不存在，请重新登录' });
  }
  if (user.status !== USER_STATUS.APPROVED) {
    clearAuthCookie(res);
    return res.status(403).json({ error: statusMessage(user.status) });
  }

  req.user = { userId: user.id, familyId: user.family_id, isAdmin: user.is_admin };
  next();
}

// 中间件：要求是管理员（必须放在 requireAuth 后面）
export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: '只有管理员能做这个操作' });
  }
  next();
}

// 中间件：要求已加入家庭
export function requireFamily(req, res, next) {
  if (!req.user?.familyId) {
    return res.status(403).json({ error: '还没加入家庭' });
  }
  next();
}
