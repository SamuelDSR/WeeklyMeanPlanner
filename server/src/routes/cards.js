// 会员卡：家庭共享。谁都能看、能加、能改 —— 卡本来就是全家一起用的。
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { parseId, sanitizePhotoURL } from '../validate.js';
import { CARD_FORMATS, validateCode } from '../cardFormats.js';

const router = Router();
router.use(requireAuth, requireFamily);

const MAX_NAME = 40;
const MAX_NOTE = 200;
// 只用 tailwind.config.js 里真有的颜色，否则前端拼出来的 class 是空的
const COLORS = ['indigo', 'wheat', 'persimmon', 'matcha', 'ink'];

function toCardJson(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    codeFormat: row.code_format,
    note: row.note,
    color: row.color,
    photoURL: row.photo_url,
    thumbURL: row.thumb_url,
    sortOrder: row.sort_order,
  };
}

// 可选的码格式列表，给前端下拉框用
router.get('/formats', (req, res) => {
  res.json({ formats: CARD_FORMATS, colors: COLORS });
});

router.get('/', async (req, res) => {
  const result = await query(
    'SELECT * FROM loyalty_cards WHERE family_id=$1 ORDER BY sort_order, id',
    [req.user.familyId]
  );
  res.json({ cards: result.rows.map(toCardJson) });
});

// 校验一份卡的字段。partial=true 时只看传了的（PATCH 用）
function validateCard(body, existing = null) {
  const out = {};

  if (body?.name !== undefined || !existing) {
    const name = String(body?.name ?? '').trim();
    if (!name) return { error: '卡的名字不能为空' };
    if (name.length > MAX_NAME) return { error: `名字最多 ${MAX_NAME} 个字` };
    out.name = name;
  }

  // 码和格式要一起校验：格式变了，原来的码可能就不合法了
  const wantsCode = body?.code !== undefined || body?.codeFormat !== undefined || !existing;
  if (wantsCode) {
    const format = body?.codeFormat ?? existing?.code_format ?? 'CODE128';
    const code = body?.code ?? existing?.code ?? '';
    const checked = validateCode(code, format);
    if (checked.error) return { error: checked.error };
    out.code = checked.value;
    out.code_format = format;
  }

  if (body?.note !== undefined) {
    const note = String(body.note ?? '').trim();
    if (note.length > MAX_NOTE) return { error: `备注最多 ${MAX_NOTE} 个字` };
    out.note = note;
  }

  if (body?.color !== undefined) {
    if (!COLORS.includes(body.color)) return { error: '这个颜色不在可选范围里' };
    out.color = body.color;
  }

  if (body?.photoURL !== undefined) out.photo_url = sanitizePhotoURL(body.photoURL);
  if (body?.thumbURL !== undefined) out.thumb_url = sanitizePhotoURL(body.thumbURL);

  return { value: out };
}

router.post('/', async (req, res) => {
  const { error, value } = validateCard(req.body);
  if (error) return res.status(400).json({ error });

  const next = await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM loyalty_cards WHERE family_id=$1',
    [req.user.familyId]
  );
  const result = await query(
    `INSERT INTO loyalty_cards (family_id, name, code, code_format, note, color,
                                photo_url, thumb_url, sort_order, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      req.user.familyId,
      value.name,
      value.code,
      value.code_format,
      value.note ?? '',
      value.color ?? 'indigo',
      value.photo_url ?? null,
      value.thumb_url ?? null,
      next.rows[0].n,
      req.user.userId,
    ]
  );
  res.json({ card: toCardJson(result.rows[0]) });
});

// 重新排序：传完整的 id 数组。
// 必须放在 '/:id' 前面 —— Express 按顺序匹配，否则 'order' 会被当成 id。
router.patch('/order', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(parseId).filter(Boolean) : null;
  if (!ids || ids.length === 0) return res.status(400).json({ error: 'ids 必须是非空数组' });

  const owned = await query(
    'SELECT id FROM loyalty_cards WHERE id = ANY($1) AND family_id=$2',
    [ids, req.user.familyId]
  );
  if (owned.rows.length !== ids.length) {
    return res.status(400).json({ error: '有卡不属于这个家庭' });
  }
  for (let i = 0; i < ids.length; i += 1) {
    await query('UPDATE loyalty_cards SET sort_order=$1 WHERE id=$2', [i, ids[i]]);
  }
  const result = await query(
    'SELECT * FROM loyalty_cards WHERE family_id=$1 ORDER BY sort_order, id',
    [req.user.familyId]
  );
  res.json({ cards: result.rows.map(toCardJson) });
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '卡 id 不合法' });

  const found = await query('SELECT * FROM loyalty_cards WHERE id=$1 AND family_id=$2', [
    id,
    req.user.familyId,
  ]);
  if (found.rows.length === 0) return res.status(404).json({ error: '没找到这张卡' });

  const { error, value } = validateCard(req.body, found.rows[0]);
  if (error) return res.status(400).json({ error });

  const columns = Object.keys(value);
  if (columns.length === 0) return res.status(400).json({ error: '没有要改的内容' });

  const sets = columns.map((c, i) => `${c}=$${i + 1}`);
  const values = columns.map((c) => value[c]);
  values.push(id, req.user.familyId);
  const result = await query(
    `UPDATE loyalty_cards SET ${sets.join(', ')}, updated_at=now()
      WHERE id=$${values.length - 1} AND family_id=$${values.length} RETURNING *`,
    values
  );
  res.json({ card: toCardJson(result.rows[0]) });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '卡 id 不合法' });
  const result = await query(
    'DELETE FROM loyalty_cards WHERE id=$1 AND family_id=$2 RETURNING id',
    [id, req.user.familyId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: '没找到这张卡' });
  res.json({ ok: true });
});

export default router;
