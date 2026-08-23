// 主食管理：家庭自己的主食清单（米饭 / 面条 / 意面…）+ 默认主食 + 哪几顿配主食。
//
// 「每人一顿吃多少」是这里的关键字段：购物清单靠它算总量（详见 staples.js）。
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { parseId } from '../validate.js';
import { MEAL_SLOTS } from '../recommend.js';
import { toStapleJson } from '../staples.js';

const router = Router();
router.use(requireAuth, requireFamily);

const MAX_NAME_LENGTH = 30;
const MAX_AMOUNT = 100000;
const ING_CATEGORIES = ['蔬菜类', '水果类', '肉禽类', '水产类', '蛋奶类', '干货粮油', '调料', '其他'];

// 一份主食的字段校验。partial=true 时只校验传了的字段（PATCH 用）
function validateStaple(body, { partial = false } = {}) {
  const out = {};

  if (body?.name !== undefined || !partial) {
    const name = String(body?.name ?? '').trim();
    if (!name) return { error: '主食名称不能为空' };
    if (name.length > MAX_NAME_LENGTH) return { error: `主食名称最多 ${MAX_NAME_LENGTH} 个字` };
    out.name = name;
  }

  if (body?.amountPerPerson !== undefined || !partial) {
    const amount = Number(body?.amountPerPerson);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return { error: '每人份量要是大于 0 的数' };
    }
    out.amountPerPerson = amount;
  }

  if (body?.unit !== undefined || !partial) {
    const unit = String(body?.unit ?? '').trim();
    if (!unit) return { error: '单位不能为空' };
    if (unit.length > 10) return { error: '单位太长了' };
    out.unit = unit;
  }

  if (body?.category !== undefined) {
    const category = String(body.category);
    if (!ING_CATEGORIES.includes(category)) return { error: '分类不认识' };
    out.category = category;
  }

  return { value: out };
}

async function loadStaples(familyId) {
  const r = await query(
    'SELECT * FROM staples WHERE family_id=$1 ORDER BY sort_order, id',
    [familyId]
  );
  return r.rows.map(toStapleJson);
}

async function loadSettings(familyId) {
  const r = await query(
    'SELECT default_staple_id, staple_meals FROM families WHERE id=$1',
    [familyId]
  );
  const row = r.rows[0];
  return {
    defaultStapleId: row?.default_staple_id ?? null,
    stapleMeals: row?.staple_meals ?? [],
  };
}

async function respond(res, familyId) {
  const [staples, settings] = await Promise.all([loadStaples(familyId), loadSettings(familyId)]);
  res.json({ staples, settings });
}

router.get('/', async (req, res) => {
  await respond(res, req.user.familyId);
});

router.post('/', async (req, res) => {
  const { error, value } = validateStaple(req.body);
  if (error) return res.status(400).json({ error });

  const next = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM staples WHERE family_id=$1',
    [req.user.familyId]
  );
  await query(
    `INSERT INTO staples (family_id, name, amount_per_person, unit, category, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      req.user.familyId,
      value.name,
      value.amountPerPerson,
      value.unit,
      value.category || '干货粮油',
      next.rows[0].n,
    ]
  );
  await respond(res, req.user.familyId);
});

// 默认主食 + 哪几顿自动配主食。
// 必须放在 '/:id' 前面：Express 按顺序匹配，否则 'settings' 会被当成 id。
router.patch('/settings', async (req, res) => {
  const updates = [];
  const values = [];

  if (req.body?.defaultStapleId !== undefined) {
    const raw = req.body.defaultStapleId;
    if (raw === null) {
      values.push(null);
      updates.push(`default_staple_id=$${values.length}`);
    } else {
      const id = parseId(raw);
      if (!id) return res.status(400).json({ error: '默认主食 id 不合法' });
      const owns = await query('SELECT id FROM staples WHERE id=$1 AND family_id=$2', [
        id,
        req.user.familyId,
      ]);
      if (owns.rows.length === 0) return res.status(400).json({ error: '这个主食不属于你的家庭' });
      values.push(id);
      updates.push(`default_staple_id=$${values.length}`);
    }
  }

  if (req.body?.stapleMeals !== undefined) {
    const meals = req.body.stapleMeals;
    if (!Array.isArray(meals) || meals.some((m) => !MEAL_SLOTS.includes(m))) {
      return res.status(400).json({ error: '餐次只能是午餐/晚餐' });
    }
    values.push(Array.from(new Set(meals)));
    updates.push(`staple_meals=$${values.length}`);
  }

  if (updates.length === 0) return res.status(400).json({ error: '没有要改的内容' });

  values.push(req.user.familyId);
  await query(`UPDATE families SET ${updates.join(', ')} WHERE id=$${values.length}`, values);
  await respond(res, req.user.familyId);
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '主食 id 不合法' });

  const { error, value } = validateStaple(req.body, { partial: true });
  if (error) return res.status(400).json({ error });

  const fields = { name: 'name', amountPerPerson: 'amount_per_person', unit: 'unit', category: 'category' };
  const updates = [];
  const values = [];
  for (const [key, column] of Object.entries(fields)) {
    if (value[key] !== undefined) {
      values.push(value[key]);
      updates.push(`${column}=$${values.length}`);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: '没有要改的内容' });

  values.push(id, req.user.familyId);
  const result = await query(
    `UPDATE staples SET ${updates.join(', ')}
      WHERE id=$${values.length - 1} AND family_id=$${values.length} RETURNING id`,
    values
  );
  if (result.rows.length === 0) return res.status(404).json({ error: '没找到这个主食' });
  await respond(res, req.user.familyId);
});

// 删掉一个主食。已经排进菜单的那几顿靠快照字段兜底，历史不会变成空白。
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '主食 id 不合法' });

  const result = await query('DELETE FROM staples WHERE id=$1 AND family_id=$2 RETURNING id', [
    id,
    req.user.familyId,
  ]);
  if (result.rows.length === 0) return res.status(404).json({ error: '没找到这个主食' });
  await respond(res, req.user.familyId);
});

export default router;
