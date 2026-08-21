import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../auth.js';
import { USER_STATUS, statusMessage } from '../userStatus.js';
import { validateRegistration, normalizeEmail } from '../validate.js';
import { shouldBecomeAdmin } from '../adminBootstrap.js';
import { makeUniqueInviteCode } from '../inviteCode.js';

const router = Router();

// 注册 = 提交一份待审核申请。
// 除了管理员账号本身，注册完不会发 cookie、也登不进去，要等管理员在后台点通过。
router.post('/register', async (req, res) => {
  const { error, value } = validateRegistration(req.body);
  if (error) return res.status(400).json({ error });
  const { email, password, displayName } = value;

  const exists = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (exists.rows.length > 0) {
    return res.status(400).json({ error: '这个邮箱已经注册过了' });
  }

  const isAdmin = await shouldBecomeAdmin(email);
  const status = isAdmin ? USER_STATUS.APPROVED : USER_STATUS.PENDING;
  const hash = await bcrypt.hash(password, 10);

  const result = await query(
    `INSERT INTO users (email, password_hash, display_name, status, is_admin, approved_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN now() ELSE NULL END)
     RETURNING id, email, display_name, family_id, status, is_admin`,
    [email, hash, displayName, status, isAdmin]
  );
  const user = result.rows[0];

  // 待审核的账号不发 cookie
  if (user.status !== USER_STATUS.APPROVED) {
    return res.status(202).json({ status: user.status, message: statusMessage(user.status) });
  }

  const token = signToken({ userId: user.id, familyId: user.family_id });
  setAuthCookie(res, token);
  res.json({ status: user.status, user: toUserJson(user) });
});

router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const { password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: '请输入邮箱和密码' });

  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: '邮箱或密码不对' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: '邮箱或密码不对' });

  // 密码对了也不一定放进来：还得看审核状态
  if (user.status !== USER_STATUS.APPROVED) {
    return res.status(403).json({ status: user.status, error: statusMessage(user.status) });
  }

  const token = signToken({ userId: user.id, familyId: user.family_id });
  setAuthCookie(res, token);
  res.json({ status: user.status, user: toUserJson(user) });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT u.id, u.email, u.display_name, u.family_id, u.is_admin,
            f.name AS family_name, f.invite_code, f.member_count, f.owner_id
     FROM users u LEFT JOIN families f ON f.id = u.family_id
     WHERE u.id = $1`,
    [req.user.userId]
  );
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: '用户不存在' });
  res.json({
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      familyId: row.family_id,
      isAdmin: row.is_admin,
      family: row.family_id
        ? {
            id: row.family_id,
            name: row.family_name,
            inviteCode: row.invite_code,
            memberCount: row.member_count,
            ownerId: row.owner_id,
          }
        : null,
    },
  });
});

// 改自己的账号设置（目前就一个显示名称）
router.patch('/me', requireAuth, async (req, res) => {
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
  if (!displayName) return res.status(400).json({ error: '称呼不能为空' });
  if (displayName.length > 40) return res.status(400).json({ error: '称呼最多 40 个字' });

  const result = await query(
    'UPDATE users SET display_name=$1 WHERE id=$2 RETURNING id, email, display_name, family_id, is_admin',
    [displayName, req.user.userId]
  );
  res.json({ user: toUserJson(result.rows[0]) });
});

router.post('/family/create', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '家庭名称不能为空' });

  // 已经有家庭的人再调这个接口，只会凭空多出一个没人用的家庭，直接拦掉
  if (req.user.familyId) {
    return res.status(400).json({ error: '你已经在一个家庭里了' });
  }

  // 建家庭的人就是创建者，之后由他管理这个家庭
  const inviteCode = await makeUniqueInviteCode(query);
  const famResult = await query(
    `INSERT INTO families (name, invite_code, owner_id) VALUES ($1,$2,$3)
     RETURNING id, name, invite_code, member_count, owner_id`,
    [name.trim(), inviteCode, req.user.userId]
  );
  const family = famResult.rows[0];
  await query('UPDATE users SET family_id = $1 WHERE id = $2', [family.id, req.user.userId]);

  const token = signToken({ userId: req.user.userId, familyId: family.id });
  setAuthCookie(res, token);
  res.json({ family: toFamilyJson(family) });
});

router.post('/family/join', requireAuth, async (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode?.trim()) return res.status(400).json({ error: '请输入邀请码' });

  const famResult = await query('SELECT * FROM families WHERE invite_code = $1', [
    inviteCode.trim().toUpperCase(),
  ]);
  const family = famResult.rows[0];
  if (!family) return res.status(404).json({ error: '邀请码不存在，请检查后重试' });

  await query('UPDATE users SET family_id = $1 WHERE id = $2', [family.id, req.user.userId]);

  // 这个家庭没人管了（上一批成员都退出过），那就由加进来的这个人接管
  if (family.owner_id == null) {
    await query('UPDATE families SET owner_id=$1 WHERE id=$2', [req.user.userId, family.id]);
  }

  const token = signToken({ userId: req.user.userId, familyId: family.id });
  setAuthCookie(res, token);
  const fresh = await query(
    'SELECT id, name, invite_code, member_count, owner_id FROM families WHERE id=$1',
    [family.id]
  );
  res.json({ family: toFamilyJson(fresh.rows[0]) });
});

function toFamilyJson(family) {
  return {
    id: family.id,
    name: family.name,
    inviteCode: family.invite_code,
    memberCount: family.member_count,
    ownerId: family.owner_id,
  };
}

function toUserJson(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    familyId: user.family_id,
    isAdmin: user.is_admin ?? false,
  };
}

export default router;
