// 家庭邀请码：给人念、给人手打的短码，所以
//   - 去掉容易看错的字符（I / O / 0 / 1）
//   - 用 crypto 而不是 Math.random，避免可预测
import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

export function makeInviteCode() {
  const bytes = crypto.randomBytes(LENGTH);
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

// 取一个库里还没用过的码。UNIQUE 约束是最后一道防线，这里只是尽量别撞上。
export async function makeUniqueInviteCode(query, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const code = makeInviteCode();
    const { rows } = await query('SELECT 1 FROM families WHERE invite_code = $1', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('生成邀请码失败，请再试一次');
}
