// 记账：主账本 = 这个家庭本身，子账本 = 度假/装修这类有名字的开销集合。
//
// 关键设计：**没有"主账本"这行记录**。expenses.ledger_id 为空就是日常开销，
// 总账就是全部 expenses。所以两个问题都能答：
//   「这次度假花了多少」        -> 只看那个子账本
//   「这个月一共花了多少」      -> 全部，度假的钱也算进去
// 如果把子账本做成独立的钱袋子，第二个问题就永远答不对了。
import { Router } from 'express';
import { query, pool } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { parseId } from '../validate.js';
import { parseAmount, sumByCurrency, groupSums, isSupportedCurrency, SUPPORTED_CURRENCIES } from '../money.js';

const router = Router();
router.use(requireAuth, requireFamily);

const MAX_NAME = 40;
const MAX_NOTE = 500;
export const EXPENSE_CATEGORIES = [
  '餐饮', '食材', '交通', '住宿', '购物', '娱乐', '医疗', '居家', '通讯', '其他',
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toLedgerJson(row) {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    startsOn: row.starts_on ? String(row.starts_on).slice(0, 10) : null,
    endsOn: row.ends_on ? String(row.ends_on).slice(0, 10) : null,
    currency: row.currency,
    archivedAt: row.archived_at,
  };
}

function toExpenseJson(row) {
  return {
    id: row.id,
    ledgerId: row.ledger_id,
    spentOn: String(row.spent_on).slice(0, 10),
    amount: Number(row.amount),
    currency: row.currency,
    category: row.category,
    note: row.note,
    paidBy: row.paid_by,
    paidByName: row.paid_by_name,
  };
}

async function familyCurrency(familyId) {
  const r = await query('SELECT currency FROM families WHERE id=$1', [familyId]);
  return r.rows[0]?.currency || 'EUR';
}

// ---------- 元数据 ----------

router.get('/meta', async (req, res) => {
  res.json({
    categories: EXPENSE_CATEGORIES,
    currencies: SUPPORTED_CURRENCIES,
    familyCurrency: await familyCurrency(req.user.familyId),
  });
});

// ---------- 总览 ----------
// GET /api/ledgers?month=YYYY-MM
// 一次给全：子账本列表、每个子账本的合计、日常合计、按分类的合计。
router.get('/', async (req, res) => {
  const familyId = req.user.familyId;
  const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
    ? req.query.month
    : null;

  const [ledgersResult, allExpenses, monthExpenses] = await Promise.all([
    query('SELECT * FROM ledgers WHERE family_id=$1 ORDER BY archived_at NULLS FIRST, COALESCE(starts_on, created_at::date) DESC, id DESC', [familyId]),
    // 子账本合计要看它的全部历史，不受当前月份筛选影响 ——
    // 「这次度假一共花了多少」跟你现在在看哪个月无关
    query('SELECT ledger_id, amount, currency, category FROM expenses WHERE family_id=$1', [familyId]),
    month
      ? query(
          `SELECT ledger_id, amount, currency, category FROM expenses
            WHERE family_id=$1 AND to_char(spent_on, 'YYYY-MM') = $2`,
          [familyId, month]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const scope = month ? monthExpenses.rows : allExpenses.rows;

  res.json({
    ledgers: ledgersResult.rows.map(toLedgerJson),
    familyCurrency: await familyCurrency(familyId),
    month,
    // 当前范围（某个月，或者全部）的总计
    totals: sumByCurrency(scope),
    byCategory: groupSums(scope, (r) => r.category),
    // 每个子账本的**全部历史**合计，外加没挂账本的日常
    byLedger: groupSums(allExpenses.rows, (r) => r.ledger_id, 'daily'),
  });
});

// ---------- 子账本 ----------

function validateLedger(body, partial = false) {
  const out = {};
  if (body?.name !== undefined || !partial) {
    const name = String(body?.name ?? '').trim();
    if (!name) return { error: '子账本名字不能为空' };
    if (name.length > MAX_NAME) return { error: `名字最多 ${MAX_NAME} 个字` };
    out.name = name;
  }
  if (body?.note !== undefined) {
    const note = String(body.note ?? '').trim();
    if (note.length > MAX_NOTE) return { error: '备注太长了' };
    out.note = note;
  }
  for (const [key, column] of [['startsOn', 'starts_on'], ['endsOn', 'ends_on']]) {
    if (body?.[key] !== undefined) {
      const v = body[key];
      if (v === null || v === '') {
        out[column] = null;
      } else if (typeof v === 'string' && ISO_DATE.test(v)) {
        out[column] = v;
      } else {
        return { error: '日期要写成 YYYY-MM-DD' };
      }
    }
  }
  if (out.starts_on && out.ends_on && out.ends_on < out.starts_on) {
    return { error: '结束日期不能早于开始日期' };
  }
  if (body?.currency !== undefined) {
    if (body.currency === null || body.currency === '') {
      out.currency = null;
    } else if (!isSupportedCurrency(body.currency)) {
      return { error: '不支持这个货币' };
    } else {
      out.currency = body.currency;
    }
  }
  return { value: out };
}

router.post('/', async (req, res) => {
  const { error, value } = validateLedger(req.body);
  if (error) return res.status(400).json({ error });
  const result = await query(
    `INSERT INTO ledgers (family_id, name, note, starts_on, ends_on, currency, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      req.user.familyId,
      value.name,
      value.note ?? '',
      value.starts_on ?? null,
      value.ends_on ?? null,
      value.currency ?? null,
      req.user.userId,
    ]
  );
  res.json({ ledger: toLedgerJson(result.rows[0]) });
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '子账本 id 不合法' });

  const found = await query('SELECT * FROM ledgers WHERE id=$1 AND family_id=$2', [id, req.user.familyId]);
  if (found.rows.length === 0) return res.status(404).json({ error: '没找到这个子账本' });

  const { error, value } = validateLedger(req.body, true);
  if (error) return res.status(400).json({ error });

  // 归档 / 取消归档
  if (req.body?.archived !== undefined) {
    if (typeof req.body.archived !== 'boolean') {
      return res.status(400).json({ error: 'archived 必须是 true 或 false' });
    }
    value.archived_at = req.body.archived ? new Date() : null;
  }

  const columns = Object.keys(value);
  if (columns.length === 0) return res.status(400).json({ error: '没有要改的内容' });
  const sets = columns.map((c, i) => `${c}=$${i + 1}`);
  const values = columns.map((c) => value[c]);
  values.push(id, req.user.familyId);
  const result = await query(
    `UPDATE ledgers SET ${sets.join(', ')} WHERE id=$${values.length - 1} AND family_id=$${values.length} RETURNING *`,
    values
  );
  res.json({ ledger: toLedgerJson(result.rows[0]) });
});

// 删子账本。里面的开销**不删** —— ON DELETE SET NULL 让它们回到「日常」。
// 花出去的钱是事实，不该因为整理账本而消失。
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '子账本 id 不合法' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const moved = await client.query(
      'SELECT COUNT(*)::int AS n FROM expenses WHERE ledger_id=$1 AND family_id=$2',
      [id, req.user.familyId]
    );
    const result = await client.query(
      'DELETE FROM ledgers WHERE id=$1 AND family_id=$2 RETURNING id',
      [id, req.user.familyId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: '没找到这个子账本' });
    }
    await client.query('COMMIT');
    res.json({ ok: true, movedToDaily: moved.rows[0].n });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: '删除失败' });
  } finally {
    client.release();
  }
});

export default router;
