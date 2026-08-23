import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { buildShoppingList } from '../shoppingAggregate.js';
import { buildWeekDays } from '../weekDays.js';
import { resolveWeekStart, normalizeWeekParam } from '../weeks.js';
import { autoConfirmFinishedWeeks, familyTimeZone } from '../autoConfirm.js';
import { resolveWeekStaples, computeStaplePlan, toStapleJson } from '../staples.js';

const router = Router();
router.use(requireAuth, requireFamily);

// 「本周」还是「下一周」——和菜单页用同一套口径（服务端按家庭时区算）
async function resolveWeek(req) {
  const timeZone = await familyTimeZone(req.user.familyId);
  const which = normalizeWeekParam(req.query.week);
  return { timeZone, which, weekStart: resolveWeekStart(which, timeZone) };
}

// GET /api/shopping?week=current|next
router.get('/', async (req, res) => {
  const { timeZone, which, weekStart } = await resolveWeek(req);
  await autoConfirmFinishedWeeks(req.user.familyId, timeZone);

  const found = await query(
    'SELECT id, week_start FROM shopping_lists WHERE family_id=$1 AND week_start=$2',
    [req.user.familyId, weekStart]
  );
  const list = found.rows[0];
  if (!list) return res.json({ list: null, week: which, weekStart });

  const items = await query(
    `SELECT id, name, category, qty, unit, is_optional, checked
       FROM shopping_list_items WHERE shopping_list_id=$1
      ORDER BY category, is_optional, name`,
    [list.id]
  );
  res.json({
    list: {
      week: which,
      weekStart,
      items: items.rows.map((i) => ({ ...i, qty: Number(i.qty), isOptional: i.is_optional })),
    },
  });
});

router.post('/generate', async (req, res) => {
  const familyId = req.user.familyId;
  const { weekStart } = await resolveWeek(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const menuResult = await client.query(
      'SELECT id, week_start FROM weekly_menus WHERE family_id=$1 AND week_start=$2',
      [familyId, weekStart]
    );
    const menu = menuResult.rows[0];
    if (!menu) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '这一周还没有菜单，先排菜再生成购物清单' });
    }

    const slotsRaw = await client.query(
      // is_eat_out 一定要选出来：buildWeekDays 靠它区分「出去吃」和「排了菜」。
      // 少了这一列，出去吃的那几顿会被当成有菜，主食就会白买一份。
      'SELECT date, weekday, meal_slot, recipe_id, is_eat_out FROM menu_slots WHERE weekly_menu_id=$1',
      [menu.id]
    );
    const recipeIds = Array.from(
      new Set(slotsRaw.rows.map((r) => r.recipe_id).filter((id) => id !== null))
    );

    const recipesById = new Map();
    if (recipeIds.length > 0) {
      const recipesResult = await client.query(
        'SELECT id, name, servings, is_store_bought FROM recipes WHERE id = ANY($1)',
        [recipeIds]
      );
      const ingResult = await client.query(
        'SELECT recipe_id, name, amount, unit, category, is_optional FROM ingredients WHERE recipe_id = ANY($1)',
        [recipeIds]
      );
      const ingByRecipe = {};
      ingResult.rows.forEach((i) => {
        if (!ingByRecipe[i.recipe_id]) ingByRecipe[i.recipe_id] = [];
        ingByRecipe[i.recipe_id].push({ ...i, isOptional: i.is_optional === true });
      });
      recipesResult.rows.forEach((r) => {
        const ings = ingByRecipe[r.id] || [];
        recipesById.set(r.id, {
          name: r.name,
          servings: r.servings,
          isStoreBought: r.is_store_bought,
          purchase: r.is_store_bought && ings.find((i) => !i.isOptional)
            ? (() => {
                const first = ings.find((i) => !i.isOptional);
                return { qty: Number(first.amount), unit: first.unit };
              })()
            : null,
          ingredients: ings,
        });
      });
    }

    // 家里几口人决定每道菜要做几份，进而决定食材买多少
    const familyResult = await client.query('SELECT member_count FROM families WHERE id=$1', [familyId]);
    const memberCount = familyResult.rows[0]?.member_count ?? 2;

    const days = buildWeekDays(menu.week_start, slotsRaw.rows);

    // 主食：家庭默认 + 这一周的例外 -> 每人份量 x 人数 x 顿数
    const [staplesResult, stapleSettings, overrides] = await Promise.all([
      client.query('SELECT * FROM staples WHERE family_id=$1 ORDER BY sort_order, id', [familyId]),
      client.query('SELECT default_staple_id, staple_meals FROM families WHERE id=$1', [familyId]),
      client.query('SELECT * FROM menu_staples WHERE weekly_menu_id=$1', [menu.id]),
    ]);
    const { byDate } = resolveWeekStaples(
      days,
      overrides.rows,
      {
        defaultStapleId: stapleSettings.rows[0]?.default_staple_id ?? null,
        stapleMeals: stapleSettings.rows[0]?.staple_meals ?? [],
      },
      staplesResult.rows.map(toStapleJson)
    );
    const staplePlan = computeStaplePlan(byDate, memberCount);

    const { items, missingDishNames, plan } = buildShoppingList(
      days,
      recipesById,
      memberCount,
      staplePlan
    );

    const listResult = await client.query(
      `INSERT INTO shopping_lists (family_id, week_start) VALUES ($1,$2)
       ON CONFLICT (family_id, week_start) DO UPDATE SET week_start = EXCLUDED.week_start
       RETURNING id`,
      [familyId, menu.week_start]
    );
    const listId = listResult.rows[0].id;
    await client.query('DELETE FROM shopping_list_items WHERE shopping_list_id=$1', [listId]);

    for (const item of items) {
      await client.query(
        `INSERT INTO shopping_list_items (shopping_list_id, name, category, qty, unit, is_optional)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [listId, item.name, item.category, item.qty, item.unit, item.isOptional === true]
      );
    }

    await client.query('COMMIT');
    res.json({ list: { weekStart, items }, missingDishNames, plan, staplePlan, memberCount });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: '生成购物清单失败' });
  } finally {
    client.release();
  }
});

router.patch('/item/:id/toggle', async (req, res) => {
  const itemId = Number(req.params.id);
  // 校验这个 item 属于当前用户的家庭，避免越权改到别人家的数据
  const owns = await query(
    `SELECT sli.id FROM shopping_list_items sli
     JOIN shopping_lists sl ON sl.id = sli.shopping_list_id
     WHERE sli.id=$1 AND sl.family_id=$2`,
    [itemId, req.user.familyId]
  );
  if (owns.rows.length === 0) return res.status(404).json({ error: '没找到这一项' });

  const result = await query(
    'UPDATE shopping_list_items SET checked = NOT checked WHERE id=$1 RETURNING checked',
    [itemId]
  );
  res.json({ id: itemId, checked: result.rows[0].checked });
});

export default router;
