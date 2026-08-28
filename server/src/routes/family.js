// 家庭管理：改名字、改人数、看/换邀请码、看成员、踢人、转让、退出。
//
// 权限：家庭的创建者（owner_id）可以管理，应用管理员也可以。
// 「家里几口人」是个生活事实、每个成员都能改（它决定购物清单买多少）。
import { Router } from 'express';
import { query, pool } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { parseId } from '../validate.js';
import { makeUniqueInviteCode } from '../inviteCode.js';
import { MEAL_SLOTS } from '../recommend.js';
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from '../money.js';

const router = Router();
router.use(requireAuth, requireFamily);

const MAX_NAME_LENGTH = 40;
const MAX_MEMBER_COUNT = 50;
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

// 只接受 MEAL_SLOTS 里的餐次 + HH:MM 的时间，其它一律拒掉
function sanitizeMealTimes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [meal, time] of Object.entries(value)) {
    if (!MEAL_SLOTS.includes(meal)) return null;
    if (!HHMM.test(String(time))) return null;
    out[meal] = String(time).padStart(5, '0');
  }
  return Object.keys(out).length > 0 ? out : null;
}

// 时区名交给 Intl 校验：认不出来就抛
function isValidTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toFamilyJson(family, { isOwner, canManage }) {
  return {
    id: family.id,
    name: family.name,
    inviteCode: family.invite_code,
    memberCount: family.member_count,
    ownerId: family.owner_id,
    timezone: family.timezone,
    mealTimes: family.meal_times,
    notifyEnabled: family.notify_enabled,
    notifyLeadMinutes: family.notify_lead_minutes,
    currency: family.currency,
    isOwner,
    canManage,
  };
}

async function loadContext(req) {
  const result = await query(
    `SELECT id, name, invite_code, member_count, owner_id, timezone, meal_times,
            notify_enabled, notify_lead_minutes, currency FROM families WHERE id=$1`,
    [req.user.familyId]
  );
  const family = result.rows[0];
  if (!family) return null;

  // owner_id 为空的情况（老数据、或者创建者的账号被删了）：
  // 让任何成员都能管理，否则这个家庭就没人管得了了
  const ownerMissing = family.owner_id == null;
  const isOwner = ownerMissing || family.owner_id === req.user.userId;
  return { family, isOwner, canManage: isOwner || req.user.isAdmin };
}

async function loadMembers(familyId, ownerId) {
  const result = await query(
    `SELECT id, display_name, email, is_admin, created_at
       FROM users WHERE family_id=$1 ORDER BY (id = $2) DESC, id`,
    [familyId, ownerId]
  );
  return result.rows.map((u) => ({
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    isAdmin: u.is_admin,
    isOwner: u.id === ownerId,
    createdAt: u.created_at,
  }));
}

router.get('/', async (req, res) => {
  const ctx = await loadContext(req);
  if (!ctx) return res.status(404).json({ error: '家庭不存在' });
  res.json({
    family: toFamilyJson(ctx.family, ctx),
    members: await loadMembers(ctx.family.id, ctx.family.owner_id),
  });
});

// 改家庭名字（要管理权限）和家里几口人（任何成员都能改）
router.patch('/', async (req, res) => {
  const ctx = await loadContext(req);
  if (!ctx) return res.status(404).json({ error: '家庭不存在' });

  const updates = [];
  const values = [];

  if (req.body?.name !== undefined) {
    if (!ctx.canManage) return res.status(403).json({ error: '只有家庭创建者能改家庭名字' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '家庭名称不能为空' });
    if (name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `家庭名称最多 ${MAX_NAME_LENGTH} 个字` });
    }
    values.push(name);
    updates.push(`name=$${values.length}`);
  }

  if (req.body?.memberCount !== undefined) {
    const memberCount = Math.floor(Number(req.body.memberCount));
    if (!Number.isInteger(memberCount) || memberCount < 1 || memberCount > MAX_MEMBER_COUNT) {
      return res.status(400).json({ error: `家庭人数要是 1 到 ${MAX_MEMBER_COUNT} 之间的整数` });
    }
    values.push(memberCount);
    updates.push(`member_count=$${values.length}`);
  }

  // 通知设置：谁都能改（这是全家共用的生活安排，不是管理动作）
  if (req.body?.notifyEnabled !== undefined) {
    if (typeof req.body.notifyEnabled !== 'boolean') {
      return res.status(400).json({ error: 'notifyEnabled 必须是 true 或 false' });
    }
    values.push(req.body.notifyEnabled);
    updates.push(`notify_enabled=$${values.length}`);
  }

  if (req.body?.notifyLeadMinutes !== undefined) {
    const lead = Math.floor(Number(req.body.notifyLeadMinutes));
    if (!Number.isInteger(lead) || lead < 0 || lead > 1440) {
      return res.status(400).json({ error: '提前时间要是 0 到 1440 分钟之间的整数' });
    }
    values.push(lead);
    updates.push(`notify_lead_minutes=$${values.length}`);
  }

  if (req.body?.mealTimes !== undefined) {
    const cleaned = sanitizeMealTimes(req.body.mealTimes);
    if (!cleaned) return res.status(400).json({ error: '餐次时间要形如 {"午餐":"12:00"}' });
    values.push(JSON.stringify(cleaned));
    updates.push(`meal_times=$${values.length}::jsonb`);
  }

  // 记账用的默认货币。改它不影响已经记下的开销 —— 每笔开销自己存了货币，
  // 换默认值不该把历史账目一起改掉。
  if (req.body?.currency !== undefined) {
    if (!isSupportedCurrency(req.body.currency)) {
      return res.status(400).json({ error: `不支持这个货币（可选：${SUPPORTED_CURRENCIES.join(' ')}）` });
    }
    values.push(req.body.currency);
    updates.push(`currency=$${values.length}`);
  }

  if (req.body?.timezone !== undefined) {
    const tz = String(req.body.timezone || '').trim();
    if (!isValidTimeZone(tz)) return res.status(400).json({ error: '时区名不认识' });
    values.push(tz);
    updates.push(`timezone=$${values.length}`);
  }

  if (updates.length === 0) return res.status(400).json({ error: '没有要改的内容' });

  values.push(ctx.family.id);
  const result = await query(
    `UPDATE families SET ${updates.join(', ')} WHERE id=$${values.length}
     RETURNING id, name, invite_code, member_count, owner_id, timezone, meal_times,
               notify_enabled, notify_lead_minutes, currency`,
    values
  );
  res.json({ family: toFamilyJson(result.rows[0], ctx) });
});

// 换一个新邀请码（旧码立刻失效）
router.post('/invite-code', async (req, res) => {
  const ctx = await loadContext(req);
  if (!ctx) return res.status(404).json({ error: '家庭不存在' });
  if (!ctx.canManage) return res.status(403).json({ error: '只有家庭创建者能换邀请码' });

  const code = await makeUniqueInviteCode(query);
  const result = await query(
    `UPDATE families SET invite_code=$1 WHERE id=$2
     RETURNING id, name, invite_code, member_count, owner_id, timezone, meal_times,
               notify_enabled, notify_lead_minutes, currency`,
    [code, ctx.family.id]
  );
  res.json({ family: toFamilyJson(result.rows[0], ctx) });
});

// 把某个成员移出家庭（他的账号还在，只是不再属于这个家庭）
router.delete('/members/:id', async (req, res) => {
  const ctx = await loadContext(req);
  if (!ctx) return res.status(404).json({ error: '家庭不存在' });
  if (!ctx.canManage) return res.status(403).json({ error: '只有家庭创建者能移出成员' });

  const targetId = parseId(req.params.id);
  if (!targetId) return res.status(400).json({ error: '成员 id 不合法' });
  if (targetId === ctx.family.owner_id) {
    return res.status(400).json({ error: '不能移出家庭创建者，先把创建者转让给别人' });
  }
  if (targetId === req.user.userId) {
    return res.status(400).json({ error: '要退出请用「退出家庭」' });
  }

  const result = await query(
    'UPDATE users SET family_id=NULL WHERE id=$1 AND family_id=$2 RETURNING id',
    [targetId, ctx.family.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: '这个人不在你的家庭里' });
  res.json({ ok: true, removedId: targetId });
});

// 把「创建者」转给另一个成员
router.post('/transfer/:id', async (req, res) => {
  const ctx = await loadContext(req);
  if (!ctx) return res.status(404).json({ error: '家庭不存在' });
  if (!ctx.canManage) return res.status(403).json({ error: '只有家庭创建者能转让' });

  const targetId = parseId(req.params.id);
  if (!targetId) return res.status(400).json({ error: '成员 id 不合法' });

  const member = await query('SELECT id FROM users WHERE id=$1 AND family_id=$2', [
    targetId,
    ctx.family.id,
  ]);
  if (member.rows.length === 0) return res.status(404).json({ error: '这个人不在你的家庭里' });

  const result = await query(
    `UPDATE families SET owner_id=$1 WHERE id=$2
     RETURNING id, name, invite_code, member_count, owner_id, timezone, meal_times,
               notify_enabled, notify_lead_minutes, currency`,
    [targetId, ctx.family.id]
  );
  const updated = result.rows[0];
  res.json({
    family: toFamilyJson(updated, {
      isOwner: updated.owner_id === req.user.userId,
      canManage: updated.owner_id === req.user.userId || req.user.isAdmin,
    }),
  });
});

// 自己退出家庭。菜谱/菜单都挂在家庭上，不会跟着走。
router.post('/leave', async (req, res) => {
  const ctx = await loadContext(req);
  if (!ctx) return res.status(404).json({ error: '家庭不存在' });

  const others = await query(
    'SELECT COUNT(*)::int AS n FROM users WHERE family_id=$1 AND id<>$2',
    [ctx.family.id, req.user.userId]
  );
  // 创建者走了就没人能管这个家庭了，所以先转让
  if (ctx.family.owner_id === req.user.userId && others.rows[0].n > 0) {
    return res.status(400).json({ error: '你是家庭创建者，先把创建者转让给其他成员再退出' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET family_id=NULL WHERE id=$1', [req.user.userId]);
    // 最后一个人走了，家庭就没有创建者了；下一个加进来的人自动获得管理权
    if (others.rows[0].n === 0) {
      await client.query('UPDATE families SET owner_id=NULL WHERE id=$1', [ctx.family.id]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: '退出失败' });
  } finally {
    client.release();
  }
});

export default router;
