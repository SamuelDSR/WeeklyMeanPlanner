// 第一个管理员从哪来？
//
//   .env 里设了 ADMIN_EMAIL  ->  这个邮箱注册时自动成为管理员并直接通过审核
//   没设 ADMIN_EMAIL         ->  数据库里第一个注册的账号自动成为管理员
//
// 第二条是兜底规则：否则一个谁都没审核过的新库会没人能批准任何人，整个应用直接锁死。
import { query } from './db.js';
import { normalizeEmail } from './validate.js';

export function configuredAdminEmail() {
  return normalizeEmail(process.env.ADMIN_EMAIL);
}

// 注册时调用：这个邮箱是否应该被自动提升为管理员
export async function shouldBecomeAdmin(email) {
  const adminEmail = configuredAdminEmail();
  if (adminEmail) return email === adminEmail;

  const { rows } = await query('SELECT 1 FROM users LIMIT 1');
  return rows.length === 0;
}

// 每次启动时调用：ADMIN_EMAIL 指定的账号如果已经注册过（比如是在设这个变量之前注册的），
// 就把它补成管理员 + 已通过审核。跑多少次都一样，是幂等的。
export async function bootstrapAdmin() {
  const adminEmail = configuredAdminEmail();

  if (!adminEmail) {
    const { rows } = await query("SELECT 1 FROM users WHERE is_admin AND status = 'approved' LIMIT 1");
    if (rows.length === 0) {
      console.warn('[admin] 还没有管理员账号：没设 ADMIN_EMAIL，第一个注册的账号会自动成为管理员');
    }
    return;
  }

  const { rows } = await query(
    `UPDATE users
        SET is_admin = true,
            status = 'approved',
            approved_at = COALESCE(approved_at, now())
      WHERE email = $1
        AND (is_admin = false OR status <> 'approved')
      RETURNING id, email`,
    [adminEmail]
  );

  if (rows.length > 0) {
    console.log(`[admin] 已把 ${rows[0].email} 设为管理员`);
  }
}
