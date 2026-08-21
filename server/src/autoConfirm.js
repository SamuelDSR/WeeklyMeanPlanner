// 整周过完的菜单自动归档：盖上 confirmed_at 进历史，同时把这些菜标记成"做过"。
//
// 为什么懒执行（每次读菜单/购物清单/历史时顺手跑一遍）而不是靠定时任务：
// 不依赖进程一直活着，容器重启、停机几天再打开都能自动补上，
// 而且是幂等的 —— 已经确认过的周不会再动。
import { pool, query } from './db.js';
import { isWeekFinished } from './weeks.js';
import { toDateStr } from './weekDays.js';

export async function autoConfirmFinishedWeeks(familyId, timeZone) {
  const pending = await query(
    `SELECT wm.id, wm.week_start, count(ms.id)::int AS slot_count
       FROM weekly_menus wm
       LEFT JOIN menu_slots ms ON ms.weekly_menu_id = wm.id
      WHERE wm.family_id = $1 AND wm.confirmed_at IS NULL
      GROUP BY wm.id, wm.week_start`,
    [familyId]
  );

  // 空的那一周不归档：历史里堆一串"这一周没排菜"没有意义
  const due = pending.rows.filter(
    (row) => row.slot_count > 0 && isWeekFinished(toDateStr(row.week_start), timeZone)
  );
  if (due.length === 0) return [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = due.map((r) => r.id);
    await client.query('UPDATE weekly_menus SET confirmed_at = now() WHERE id = ANY($1)', [ids]);
    // 和手动确认一样：标记这些菜最近做过，推荐时会避开
    await client.query(
      `UPDATE recipes SET last_cooked_date = CURRENT_DATE
        WHERE id IN (SELECT DISTINCT recipe_id FROM menu_slots
                      WHERE weekly_menu_id = ANY($1) AND recipe_id IS NOT NULL)`,
      [ids]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('自动归档失败：', e);
    return [];
  } finally {
    client.release();
  }

  const archived = due.map((r) => toDateStr(r.week_start));
  console.log(`[auto-confirm] 家庭 ${familyId} 自动归档了：${archived.join(', ')}`);
  return archived;
}

// 家庭时区（决定"今天"和"本周"）
export async function familyTimeZone(familyId) {
  const r = await query('SELECT timezone FROM families WHERE id=$1', [familyId]);
  return r.rows[0]?.timezone || 'Europe/Paris';
}
