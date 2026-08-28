// 开销条目。列表带筛选（月份 / 子账本 / 分类），写入时金额和货币都要校验。
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { parseId } from '../validate.js';
import { parseAmount, sumByCurrency, splitByKind, isSupportedCurrency } from '../money.js';
import { isValidCategory, isValidKind } from '../expenseCategories.js';

const router = Router();
router.use(requireAuth, requireFamily);

const MAX_NOTE = 200;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toExpenseJson(row) {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    ledgerName: row.ledger_name ?? null,
    spentOn: String(row.spent_on).slice(0, 10),
    kind: row.kind || 'expense',
    amount: Number(row.amount),
    currency: row.currency,
    category: row.category,
    note: row.note,
    paidBy: row.paid_by,
    paidByName: row.paid_by_name,
  };
}

// GET /api/expenses?month=YYYY-MM&ledger=<id|daily>&category=餐饮&limit=100
router.get('/', async (req, res) => {
  const conditions = ['e.family_id = $1'];
  const values = [req.user.familyId];

  // period 同时支持 'YYYY'（按年）和 'YYYY-MM'（按月）
  if (typeof req.query.period === 'string' && /^\d{4}(-\d{2})?$/.test(req.query.period)) {
    values.push(req.query.period.length === 4 ? 'YYYY' : 'YYYY-MM');
    values.push(req.query.period);
    conditions.push(`to_char(e.spent_on, $${values.length - 1}) = $${values.length}`);
  }

  if (typeof req.query.kind === 'string' && req.query.kind) {
    if (!isValidKind(req.query.kind)) return res.status(400).json({ error: '收支类型不对' });
    values.push(req.query.kind);
    conditions.push(`e.kind = $${values.length}`);
  }
  if (req.query.ledger === 'daily') {
    conditions.push('e.ledger_id IS NULL');
  } else if (req.query.ledger !== undefined) {
    const id = parseId(req.query.ledger);
    if (!id) return res.status(400).json({ error: '子账本 id 不合法' });
    values.push(id);
    conditions.push(`e.ledger_id = $${values.length}`);
  }
  if (typeof req.query.category === 'string' && req.query.category) {
    const forKind = isValidKind(req.query.kind) ? req.query.kind : 'expense';
    if (!isValidCategory(req.query.category, forKind)) {
      return res.status(400).json({ error: '不认识这个分类' });
    }
    values.push(req.query.category);
    conditions.push(`e.category = $${values.length}`);
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
  values.push(limit);

  const result = await query(
    `SELECT e.*, l.name AS ledger_name
       FROM expenses e LEFT JOIN ledgers l ON l.id = e.ledger_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.spent_on DESC, e.id DESC
      LIMIT $${values.length}`,
    values
  );
  const rows = result.rows;
  res.json({
    expenses: rows.map(toExpenseJson),
    // 收支分开算，再给结余（各按货币分组，绝不混着加）
    totals: splitByKind(rows),
    truncated: rows.length === limit,
  });
});

async function validateExpense(body, familyId, partial = false, existing = null) {
  const out = {};

  // kind 要先定下来：分类合不合法取决于它（'工资' 只能是收入）
  let kind = existing?.kind ?? 'expense';
  if (body?.kind !== undefined) {
    if (!isValidKind(body.kind)) return { error: '收支类型只能是 expense 或 income' };
    kind = body.kind;
    out.kind = kind;
  }

  // 货币要先定下来：金额的小数位取决于它（日元没有小数）
  let currency = null;
  if (body?.currency !== undefined) {
    if (!isSupportedCurrency(body.currency)) return { error: '不支持这个货币' };
    currency = body.currency;
    out.currency = currency;
  }

  if (body?.amount !== undefined || !partial) {
    if (!currency) {
      const fam = await query('SELECT currency FROM families WHERE id=$1', [familyId]);
      currency = fam.rows[0]?.currency || 'EUR';
      if (!partial && body?.currency === undefined) out.currency = currency;
    }
    const amount = parseAmount(body?.amount, currency);
    if (amount === null) return { error: '金额填得不对，写成 12.50 或 12,50 这样' };
    if (amount <= 0) return { error: '金额要大于 0（是收还是支由上面的「支出/收入」决定）' };
    out.amount = amount;
  }

  if (body?.spentOn !== undefined || !partial) {
    const d = body?.spentOn;
    if (typeof d !== 'string' || !ISO_DATE.test(d)) return { error: '日期要写成 YYYY-MM-DD' };
    // 日期本身合不合法交给 Date 判（比如 2026-02-30 就不存在）
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, day));
    if (dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== day) return { error: '这个日期不存在' };
    out.spent_on = d;
  }

  if (body?.category !== undefined || !partial || out.kind !== undefined) {
    // 改了收支类型但没改分类时也要重新校验：'工资' 挪到支出下面就不合法了
    const c = body?.category ?? existing?.category ?? (kind === 'income' ? '工资' : '其他');
    if (!isValidCategory(c, kind)) {
      return { error: `「${c}」不是${kind === 'income' ? '收入' : '支出'}的分类` };
    }
    out.category = c;
  }

  if (body?.note !== undefined) {
    const note = String(body.note ?? '').trim();
    if (note.length > MAX_NOTE) return { error: `备注最多 ${MAX_NOTE} 个字` };
    out.note = note;
  }

  // 子账本：null / 'daily' 都表示放进日常
  if (body?.ledgerId !== undefined) {
    if (body.ledgerId === null || body.ledgerId === 'daily' || body.ledgerId === '') {
      out.ledger_id = null;
    } else {
      const id = parseId(body.ledgerId);
      if (!id) return { error: '子账本 id 不合法' };
      const owns = await query('SELECT id FROM ledgers WHERE id=$1 AND family_id=$2', [id, familyId]);
      if (owns.rows.length === 0) return { error: '这个子账本不属于你的家庭' };
      out.ledger_id = id;
    }
  }

  // 谁付的：只能是自己家的成员，名字存一份快照
  if (body?.paidBy !== undefined) {
    if (body.paidBy === null) {
      out.paid_by = null;
      out.paid_by_name = null;
    } else {
      const id = parseId(body.paidBy);
      if (!id) return { error: '付款人 id 不合法' };
      const member = await query(
        'SELECT id, display_name FROM users WHERE id=$1 AND family_id=$2',
        [id, familyId]
      );
      if (member.rows.length === 0) return { error: '这个人不在你的家庭里' };
      out.paid_by = id;
      out.paid_by_name = member.rows[0].display_name;
    }
  }

  return { value: out };
}

router.post('/', async (req, res) => {
  const { error, value } = await validateExpense(req.body, req.user.familyId);
  if (error) return res.status(400).json({ error });

  // 没指定付款人就默认记在自己头上
  if (value.paid_by === undefined) {
    const me = await query('SELECT display_name FROM users WHERE id=$1', [req.user.userId]);
    value.paid_by = req.user.userId;
    value.paid_by_name = me.rows[0]?.display_name ?? null;
  }

  const result = await query(
    `INSERT INTO expenses (family_id, ledger_id, spent_on, kind, amount, currency, category, note,
                           paid_by, paid_by_name, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.user.familyId,
      value.ledger_id ?? null,
      value.spent_on,
      value.kind ?? 'expense',
      value.amount,
      value.currency,
      value.category,
      value.note ?? '',
      value.paid_by ?? null,
      value.paid_by_name ?? null,
      req.user.userId,
    ]
  );
  res.json({ expense: toExpenseJson(result.rows[0]) });
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '开销 id 不合法' });

  const found = await query('SELECT * FROM expenses WHERE id=$1 AND family_id=$2', [id, req.user.familyId]);
  if (found.rows.length === 0) return res.status(404).json({ error: '没找到这笔开销' });

  const { error, value } = await validateExpense(req.body, req.user.familyId, true, found.rows[0]);
  if (error) return res.status(400).json({ error });

  const columns = Object.keys(value);
  if (columns.length === 0) return res.status(400).json({ error: '没有要改的内容' });
  const sets = columns.map((c, i) => `${c}=$${i + 1}`);
  const values = columns.map((c) => value[c]);
  values.push(id, req.user.familyId);
  const result = await query(
    `UPDATE expenses SET ${sets.join(', ')}
      WHERE id=$${values.length - 1} AND family_id=$${values.length} RETURNING *`,
    values
  );
  res.json({ expense: toExpenseJson(result.rows[0]) });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '开销 id 不合法' });
  const result = await query('DELETE FROM expenses WHERE id=$1 AND family_id=$2 RETURNING id', [
    id,
    req.user.familyId,
  ]);
  if (result.rows.length === 0) return res.status(404).json({ error: '没找到这笔开销' });
  res.json({ ok: true });
});

export default router;
