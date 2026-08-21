// 过去几周吃了什么。
// 按餐次一条条返回（不只是汇总数），这样界面能画出来，以后的推荐算法也能直接拿来用。
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { parseId } from '../validate.js';
import { resolveWeekStart } from '../weeks.js';
import { autoConfirmFinishedWeeks, familyTimeZone } from '../autoConfirm.js';
import { buildHistory, topDishes, summarize } from '../historyStats.js';

const router = Router();
router.use(requireAuth, requireFamily);

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;

router.get('/', async (req, res) => {
  const familyId = req.user.familyId;
  const requested = Number(req.query.weeks);
  const limit = Number.isInteger(requested) && requested > 0
    ? Math.min(requested, MAX_WEEKS)
    : DEFAULT_WEEKS;

  // 确认过的周 + **本周**（可能还没确认、正在进行中，方便边吃边评分）。
  // 注意不能用"最新那一周"：现在可以提前排下一周，那一周还没吃，
  // 出现在历史里让人给未来的饭打分就不对了。
  const timeZone = await familyTimeZone(familyId);
  await autoConfirmFinishedWeeks(familyId, timeZone);
  const currentWeekStart = resolveWeekStart('current', timeZone);

  const menus = await query(
    `SELECT id, week_start, confirmed_at
       FROM weekly_menus
      WHERE family_id=$1
        AND (confirmed_at IS NOT NULL OR week_start = $3)
      ORDER BY week_start DESC
      LIMIT $2`,
    [familyId, limit, currentWeekStart]
  );

  if (menus.rows.length === 0) {
    return res.json({
      weeks: [],
      overall: { weeks: 0, dishMeals: 0, eatOutMeals: 0, storeBoughtMeals: 0, avgHealth: null, avgLike: null, ratedMeals: 0, likeRatedMeals: 0 },
      topDishes: [],
    });
  }

  const menuIds = menus.rows.map((m) => m.id);
  const slots = await query(
    `SELECT ms.id, ms.weekly_menu_id, ms.date, ms.weekday, ms.meal_slot, ms.is_eat_out, ms.recipe_id,
            -- 菜谱还在就用菜谱上的（改名/改健康分会同步到历史），
            -- 菜谱删了就用格子上的快照兜底
            COALESCE(r.name, ms.recipe_name) AS recipe_name,
            COALESCE(r.health_score, ms.health_score) AS health_score,
            ms.like_score AS meal_like_score,
            r.like_score AS recipe_like_score, r.is_store_bought
       FROM menu_slots ms
       LEFT JOIN recipes r ON r.id = ms.recipe_id
      WHERE ms.weekly_menu_id = ANY($1)`,
    [menuIds]
  );

  const history = buildHistory(menus.rows, slots.rows);
  // 总览只统计确认过的周
  const confirmed = history.weeks.filter((w) => w.confirmedAt);
  const confirmedMeals = confirmed.flatMap((w) => w.meals);
  res.json({
    weeks: history.weeks,
    overall: { weeks: confirmed.length, ...summarize(confirmedMeals) },
    topDishes: topDishes(confirmedMeals),
  });
});

// 给「某一顿」打喜好分。这是 per-meal 评分的入口：
// 同一道菜这次做得好、上次太干，可以分别记下来。
router.patch('/meals/:id/like', async (req, res) => {
  const slotId = parseId(req.params.id);
  if (!slotId) return res.status(400).json({ error: '记录 id 不合法' });

  const raw = req.body?.likeScore;
  // null / 空 = 清掉这一顿的单独评分，回到菜谱上的默认值
  let likeScore = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = Math.floor(Number(raw));
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return res.status(400).json({ error: '喜好分要是 1 到 5 之间的整数' });
    }
    likeScore = n;
  }

  // 只能改自己家的记录
  const owns = await query(
    `SELECT ms.id FROM menu_slots ms
       JOIN weekly_menus wm ON wm.id = ms.weekly_menu_id
      WHERE ms.id=$1 AND wm.family_id=$2 AND NOT ms.is_eat_out`,
    [slotId, req.user.familyId]
  );
  if (owns.rows.length === 0) return res.status(404).json({ error: '没找到这一顿的记录' });

  const result = await query(
    'UPDATE menu_slots SET like_score=$1 WHERE id=$2 RETURNING id, like_score',
    [likeScore, slotId]
  );
  res.json({ slotId: result.rows[0].id, likeScore: result.rows[0].like_score });
});

export default router;
