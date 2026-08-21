// 管理员后台：审核注册申请、管理已有账号
// 所有接口都要求已登录 + 是管理员
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { USER_STATUS } from '../userStatus.js';
import { parseId } from '../validate.js';

const router = Router();
router.use(requireAuth, requireAdmin);

function toAdminUserJson(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    isAdmin: row.is_admin,
    familyId: row.family_id,
    familyName: row.family_name,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

async function findUser(id) {
  const result = await query('SELECT id, email, is_admin, status FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// 剩下还有几个"可用的管理员"（不算 id = exceptId 这个）
// 用来拦住"把最后一个管理员降级/拒绝/删掉"这种把自己锁在门外的操作
async function countOtherAdmins(exceptId) {
  const result = await query(
    `SELECT COUNT(*)::int AS n FROM users
      WHERE is_admin AND status = $1 AND id <> $2`,
    [USER_STATUS.APPROVED, exceptId]
  );
  return result.rows[0].n;
}

// 校验目标账号：解析 id、确认存在、可选地拦住"对自己动手"
async function resolveTarget(req, res, { allowSelf = true } = {}) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: '账号 id 不合法' });
    return null;
  }
  if (!allowSelf && id === req.user.userId) {
    res.status(400).json({ error: '不能对自己的管理员账号做这个操作' });
    return null;
  }
  const user = await findUser(id);
  if (!user) {
    res.status(404).json({ error: '账号不存在' });
    return null;
  }
  return user;
}

// 如果目标是管理员，确认它不是最后一个
async function ensureNotLastAdmin(user, res) {
  if (!user.is_admin) return true;
  if ((await countOtherAdmins(user.id)) > 0) return true;
  res.status(400).json({ error: '这是最后一个管理员账号，先指定另一个管理员再操作' });
  return false;
}

// 账号列表：待审核的排最前面，方便一眼看到要处理的申请
router.get('/users', async (req, res) => {
  const result = await query(
    `SELECT u.id, u.email, u.display_name, u.status, u.is_admin, u.family_id,
            u.created_at, u.approved_at, f.name AS family_name
       FROM users u
       LEFT JOIN families f ON f.id = u.family_id
      ORDER BY (u.status = $1) DESC, u.created_at DESC`,
    [USER_STATUS.PENDING]
  );
  const users = result.rows.map(toAdminUserJson);
  res.json({
    users,
    pendingCount: users.filter((u) => u.status === USER_STATUS.PENDING).length,
  });
});

// 通过审核
router.post('/users/:id/approve', async (req, res) => {
  const target = await resolveTarget(req, res);
  if (!target) return;

  const result = await query(
    `UPDATE users
        SET status = $1, approved_at = now(), approved_by = $2
      WHERE id = $3
      RETURNING id, email, display_name, status, is_admin, family_id, created_at, approved_at`,
    [USER_STATUS.APPROVED, req.user.userId, target.id]
  );
  res.json({ user: toAdminUserJson({ ...result.rows[0], family_name: null }) });
});

// 拒绝（保留账号记录，之后还能改回通过；被拒绝的账号立刻登不进来）
router.post('/users/:id/reject', async (req, res) => {
  const target = await resolveTarget(req, res, { allowSelf: false });
  if (!target) return;
  if (!(await ensureNotLastAdmin(target, res))) return;

  const result = await query(
    `UPDATE users
        SET status = $1, is_admin = false, approved_at = NULL, approved_by = $2
      WHERE id = $3
      RETURNING id, email, display_name, status, is_admin, family_id, created_at, approved_at`,
    [USER_STATUS.REJECTED, req.user.userId, target.id]
  );
  res.json({ user: toAdminUserJson({ ...result.rows[0], family_name: null }) });
});

// 设为 / 取消管理员
router.post('/users/:id/admin', async (req, res) => {
  const makeAdmin = req.body?.isAdmin;
  if (typeof makeAdmin !== 'boolean') {
    return res.status(400).json({ error: 'isAdmin 必须是 true 或 false' });
  }

  // 允许管理员给自己降级 —— 前提是还有别的管理员在（由 ensureNotLastAdmin 兜住），
  // 这样"先指定接班人、再自己退下来"这条路是通的
  const target = await resolveTarget(req, res);
  if (!target) return;

  if (makeAdmin && target.status !== USER_STATUS.APPROVED) {
    return res.status(400).json({ error: '要先通过审核，才能设为管理员' });
  }
  if (!makeAdmin && !(await ensureNotLastAdmin(target, res))) return;

  const result = await query(
    `UPDATE users SET is_admin = $1 WHERE id = $2
      RETURNING id, email, display_name, status, is_admin, family_id, created_at, approved_at`,
    [makeAdmin, target.id]
  );
  res.json({ user: toAdminUserJson({ ...result.rows[0], family_name: null }) });
});

// 彻底删除账号（邮箱释放出来可以重新注册）
// 家庭里的菜谱/菜单挂在 family 上，不属于某个人，所以删账号不会带走这些数据
router.delete('/users/:id', async (req, res) => {
  const target = await resolveTarget(req, res, { allowSelf: false });
  if (!target) return;
  if (!(await ensureNotLastAdmin(target, res))) return;

  await query('DELETE FROM users WHERE id = $1', [target.id]);
  res.json({ ok: true, deletedId: target.id });
});

export default router;
