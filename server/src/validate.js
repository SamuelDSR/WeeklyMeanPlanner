// 系统边界上的输入校验：所有来自请求体/URL 的值先过一遍这里

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_DISPLAY_NAME_LENGTH = 40;

// 邮箱统一小写去空格后再入库，避免 Bob@x.com / bob@x.com 被当成两个账号
// （也让 ADMIN_EMAIL 的比对不受大小写影响）
export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateRegistration({ email, password, displayName }) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = typeof displayName === 'string' ? displayName.trim() : '';

  if (!cleanEmail || !password || !cleanName) return { error: '邮箱、密码、称呼都要填' };
  if (!EMAIL_RE.test(cleanEmail)) return { error: '邮箱格式不对' };
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `密码至少要${MIN_PASSWORD_LENGTH}位` };
  }
  if (cleanName.length > MAX_DISPLAY_NAME_LENGTH) {
    return { error: `称呼太长了（最多${MAX_DISPLAY_NAME_LENGTH}个字）` };
  }
  return { value: { email: cleanEmail, password, displayName: cleanName } };
}

// URL 里的 :id 必须是正整数，否则直接当成找不到
export function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 菜品图地址只接受 /uploads/<文件名> 这一种形状。
// 这个值是从请求体里来的，之后会被拼成磁盘路径用来删文件，不能让它带上路径穿越。
const PHOTO_URL_RE = /^\/uploads\/[A-Za-z0-9._-]+$/;

export function sanitizePhotoURL(value) {
  if (typeof value !== 'string' || !value) return null;
  return PHOTO_URL_RE.test(value) ? value : null;
}
