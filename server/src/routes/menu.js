import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { generateWeeklyMenu, MEAL_SLOTS, WEEKDAY_LABELS } from '../recommend.js';
import { buildWeekDays, addDays, toDateStr } from '../weekDays.js';
import { computeDishPlan } from '../portions.js';
import { resolveWeekStart, normalizeWeekParam, mondayOf } from '../weeks.js';
import { autoConfirmFinishedWeeks, familyTimeZone } from '../autoConfirm.js';

const router = Router();
router.use(requireAuth, requireFamily);

// 「本周」还是「下一周」——都按家庭时区算，客户端只传 current / next，
// 具体是哪个周一由服务端决定（避免手机时区和服务器不一致）
async function resolveWeek(req) {
  const timeZone = await familyTimeZone(req.user.familyId);
  const which = normalizeWeekParam(req.query.week);
  return { timeZone, which, weekStart: resolveWeekStart(which, timeZone) };
}

async function findMenu(familyId, weekStart) {
  const r = await query(
    'SELECT id, week_start, confirmed_at FROM weekly_menus WHERE family_id=$1 AND week_start=$2',
    [familyId, weekStart]
  );
  return r.rows[0] || null;
}

// 找不到就建一个空的：本周/下一周随时都要能打开、能往里加菜
async function findOrCreateMenu(client, familyId, weekStart) {
  const existing = await client.query(
    'SELECT id, week_start, confirmed_at FROM weekly_menus WHERE family_id=$1 AND week_start=$2',
    [familyId, weekStart]
  );
  if (existing.rows[0]) return existing.rows[0];
  const created = await client.query(
    `INSERT INTO weekly_menus (family_id, week_start) VALUES ($1,$2)
     ON CONFLICT (family_id, week_start) DO UPDATE SET week_start = EXCLUDED.week_start
     RETURNING id, week_start, confirmed_at`,
    [familyId, weekStart]
  );
  return created.rows[0];
}

// 这一周每道菜要做几份（给页面显示"备餐计划"用）
async function loadPlan(familyId, days) {
  const [recipesResult, familyResult, purchaseResult] = await Promise.all([
    query('SELECT id, name, servings, is_store_bought FROM recipes WHERE family_id=$1', [familyId]),
    query('SELECT member_count FROM families WHERE id=$1', [familyId]),
    // 买现成的那一行「一份买多少」，用来显示「买 3 盒」
    query(
      `SELECT i.recipe_id, i.amount, i.unit
         FROM ingredients i JOIN recipes r ON r.id = i.recipe_id
        WHERE r.family_id=$1 AND r.is_store_bought`,
      [familyId]
    ),
  ]);
  const purchaseByRecipe = new Map(
    purchaseResult.rows.map((r) => [r.recipe_id, { qty: Number(r.amount), unit: r.unit }])
  );
  const recipesById = new Map(
    recipesResult.rows.map((r) => [
      r.id,
      {
        name: r.name,
        servings: r.servings,
        isStoreBought: r.is_store_bought,
        purchase: purchaseByRecipe.get(r.id) || null,
      },
    ])
  );
  const memberCount = familyResult.rows[0]?.member_count ?? 2;
  return { plan: computeDishPlan(days, recipesById, memberCount), memberCount };
}

// GET /api/menu?week=current|next
// 找不到就返回一个空的骨架（不建行）：页面永远能打开
router.get('/', async (req, res) => {
  const { timeZone, which, weekStart } = await resolveWeek(req);
  // 顺手把已经过完的周归档掉
  await autoConfirmFinishedWeeks(req.user.familyId, timeZone);

  const menu = await findMenu(req.user.familyId, weekStart);
  const slots = menu
    ? (
        await query(
          'SELECT date, weekday, meal_slot, recipe_id, is_eat_out FROM menu_slots WHERE weekly_menu_id=$1',
          [menu.id]
        )
      ).rows
    : [];

  const days = buildWeekDays(weekStart, slots);
  const { plan, memberCount } = await loadPlan(req.user.familyId, days);

  res.json({
    menu: {
      week: which,
      weekStart,
      days,
      plan,
      memberCount,
      confirmedAt: menu?.confirmed_at ?? null,
      exists: !!menu,
    },
  });
});

router.post('/generate', async (req, res) => {
  const familyId = req.user.familyId;
  const { timeZone, weekStart: targetWeekStart } = await resolveWeek(req);
  await autoConfirmFinishedWeeks(familyId, timeZone);

  const existingMenu = await query(
    'SELECT id, confirmed_at FROM weekly_menus WHERE family_id=$1 AND week_start=$2',
    [familyId, targetWeekStart]
  );
  if (existingMenu.rows[0]?.confirmed_at) {
    return res.status(400).json({
      error: `${targetWeekStart} 这一周已经确认过了（已记入历史）。要重新排的话，先点「取消确认」。`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const recipesResult = await client.query(
      'SELECT id, meals, time_minutes, last_cooked_date FROM recipes WHERE family_id=$1',
      [familyId]
    );
    const recipes = recipesResult.rows.map((r) => ({
      id: r.id,
      meals: r.meals || [],
      timeMinutes: r.time_minutes,
      lastCookedDate: r.last_cooked_date,
    }));

    const weeklyMenuId = (await findOrCreateMenu(client, familyId, targetWeekStart)).id;

    // 这一周已经排好的格子和已经用过的菜：前者不动，后者尽量别再推荐
    const existingSlots = await client.query(
      'SELECT date, meal_slot, recipe_id FROM menu_slots WHERE weekly_menu_id=$1',
      [weeklyMenuId]
    );
    const skipSlots = new Set(
      existingSlots.rows.map((r) => `${toDateStr(r.date)}|${r.meal_slot}`)
    );
    const alreadyUsed = existingSlots.rows.map((r) => r.recipe_id).filter((id) => id != null);

    let result;
    try {
      result = generateWeeklyMenu(recipes, { skipSlots, alreadyUsed, weekStart: targetWeekStart });
    } catch (e) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: e.message });
    }

    let addedCount = 0;
    for (const day of result.days) {
      for (const meal of MEAL_SLOTS) {
        for (const recipeId of day[meal] || []) {
          addedCount += 1;
          // 菜名和健康分都存一份快照：菜谱以后被删了，历史里还认得这天吃了什么、健不健康
          await client.query(
            `INSERT INTO menu_slots (weekly_menu_id, date, weekday, meal_slot, recipe_id,
                                     recipe_name, health_score)
             VALUES ($1,$2,$3,$4,$5,
                     (SELECT name FROM recipes WHERE id=$5),
                     (SELECT health_score FROM recipes WHERE id=$5))`,
            [weeklyMenuId, day.date, day.weekday, meal, recipeId]
          );
        }
      }
    }

    await client.query('COMMIT');

    // 重新读一遍再返回：这样响应里既有刚补的菜，也有本来就排好的和「出去吃」
    const slots = await query(
      'SELECT date, weekday, meal_slot, recipe_id, is_eat_out FROM menu_slots WHERE weekly_menu_id=$1',
      [weeklyMenuId]
    );
    const days = buildWeekDays(targetWeekStart, slots.rows);
    const { plan, memberCount } = await loadPlan(familyId, days);
    res.json({
      menu: { weekStart: targetWeekStart, days, plan, memberCount, confirmedAt: null },
      addedCount,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: '生成失败' });
  } finally {
    client.release();
  }
});

// 改某一格：{ date, mealSlot, recipeIds: [...] } 或 { date, mealSlot, eatOut: true }
// 传整个数组（替换这一格的全部内容），空数组就是清空这一格。
// eatOut 和菜品是互斥的：出去吃就不做饭。
router.patch('/slot', async (req, res) => {
  const familyId = req.user.familyId;
  const { date, mealSlot, recipeIds, eatOut } = req.body || {};

  if (!date || !mealSlot) return res.status(400).json({ error: '缺少日期或餐次' });
  if (!MEAL_SLOTS.includes(mealSlot)) return res.status(400).json({ error: '餐次不对' });

  const wantEatOut = eatOut === true;
  if (!wantEatOut && !Array.isArray(recipeIds)) {
    return res.status(400).json({ error: 'recipeIds 必须是数组' });
  }

  const ids = wantEatOut
    ? []
    : Array.from(new Set(recipeIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)));

  // 这一格属于哪一周，由日期本身决定 —— 比"最新那一周"稳，
  // 本周和下一周同时可编辑时也不会串
  const weekStart = mondayOf(date);

  // 只能放自己家的菜
  if (ids.length > 0) {
    const owned = await query('SELECT id FROM recipes WHERE id = ANY($1) AND family_id=$2', [ids, familyId]);
    if (owned.rows.length !== ids.length) {
      return res.status(400).json({ error: '有菜品不属于这个家庭' });
    }
  }

  const weekday =
    WEEKDAY_LABELS[
      Math.max(0, WEEKDAY_LABELS.findIndex((_, i) => addDays(weekStart, i) === date))
    ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const menu = await findOrCreateMenu(client, familyId, weekStart);
    if (menu.confirmed_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '这一周已经确认过了（已记入历史），先取消确认再改。' });
    }
    await client.query(
      'DELETE FROM menu_slots WHERE weekly_menu_id=$1 AND date=$2 AND meal_slot=$3',
      [menu.id, date, mealSlot]
    );
    if (wantEatOut) {
      await client.query(
        `INSERT INTO menu_slots (weekly_menu_id, date, weekday, meal_slot, recipe_id, is_eat_out)
         VALUES ($1,$2,$3,$4,NULL,true)`,
        [menu.id, date, weekday, mealSlot]
      );
    } else {
      for (const recipeId of ids) {
        await client.query(
          `INSERT INTO menu_slots (weekly_menu_id, date, weekday, meal_slot, recipe_id,
                                   recipe_name, health_score)
           VALUES ($1,$2,$3,$4,$5,
                   (SELECT name FROM recipes WHERE id=$5),
                   (SELECT health_score FROM recipes WHERE id=$5))`,
          [menu.id, date, weekday, mealSlot, recipeId]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, recipeIds: ids, eatOut: wantEatOut });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: '保存失败' });
  } finally {
    client.release();
  }
});

// 确认本周菜单：「这周就这么吃」。确认过的周会进历史，
// 同时把这些菜标记成做过（推荐算法会尽量避开最近做过的）。
router.post('/confirm', async (req, res) => {
  const familyId = req.user.familyId;
  const { weekStart } = await resolveWeek(req);
  const latest = await findMenu(familyId, weekStart);
  if (!latest) return res.status(400).json({ error: '这一周还没有菜单可以确认' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE weekly_menus SET confirmed_at = now() WHERE id=$1 RETURNING confirmed_at',
      [latest.id]
    );
    const used = await client.query(
      'SELECT DISTINCT recipe_id FROM menu_slots WHERE weekly_menu_id=$1 AND recipe_id IS NOT NULL',
      [latest.id]
    );
    const ids = used.rows.map((r) => r.recipe_id);
    if (ids.length > 0) {
      await client.query('UPDATE recipes SET last_cooked_date = CURRENT_DATE WHERE id = ANY($1)', [ids]);
    }
    await client.query('COMMIT');
    res.json({ confirmedAt: result.rows[0].confirmed_at, dishCount: ids.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: '确认失败' });
  } finally {
    client.release();
  }
});

// 取消确认：把这一周从历史里撤下来，之后才能重新排菜。
// 已经标记的 last_cooked_date 不回滚（没法可靠地还原），影响只是推荐时会多避开这些菜几天。
router.post('/unconfirm', async (req, res) => {
  const { weekStart } = await resolveWeek(req);
  const latest = await findMenu(req.user.familyId, weekStart);
  if (!latest) return res.status(400).json({ error: '这一周还没有菜单' });
  if (!latest.confirmed_at) return res.status(400).json({ error: '这一周还没确认过' });

  await query('UPDATE weekly_menus SET confirmed_at = NULL WHERE id=$1', [latest.id]);
  res.json({ ok: true, confirmedAt: null });
});

export default router;
