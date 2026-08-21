// 「该做饭了」的提醒。
//
// 什么时候提醒一顿饭：
//
//   提前量 = max(家庭设置的提前分钟数, 这一顿最费时的菜的耗时 + 缓冲)
//   提醒时刻 = 这一顿的钟点 - 提前量
//
// 为什么不是固定 30 分钟：hachis parmentier 要烤 60 分钟，
// 提前 30 分钟通知等于已经晚了。所以用"最慢那道菜"兜底。
//
// 只在 [提醒时刻, 开饭时刻) 这个区间里发：饭点过了就别再吵了
// （比如服务器停了一整天，开机后不该把昨天的提醒全补发一遍）。
import { query } from './db.js';
import { todayIn } from './weeks.js';
import { MEAL_SLOTS } from './recommend.js';
import { sendToSubscriptions } from './push.js';

const BUFFER_MINUTES = 15; // 备料、预热的余量
const DEFAULT_MEAL_TIMES = { 早餐: '08:00', 午餐: '12:00', 晚餐: '19:00' };

// 某个时区里现在是几点，返回从零点开始的分钟数
export function minutesOfDayIn(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}

export function parseHHMM(value, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return fallback;
  return h * 60 + min;
}

// 纯函数，方便测：给定一顿饭的信息，算出该不该现在发
export function shouldNotify({ nowMinutes, mealMinutes, leadMinutes, maxCookMinutes }) {
  const lead = Math.max(leadMinutes, (maxCookMinutes || 0) + BUFFER_MINUTES);
  const notifyAt = mealMinutes - lead;
  return {
    lead,
    notifyAt,
    due: nowMinutes >= notifyAt && nowMinutes < mealMinutes,
  };
}

// 跑一轮：把所有开了通知的家庭里"现在该提醒"的饭发出去。
// 幂等：靠 notification_log 的唯一约束保证同一顿只发一次。
export async function runMealReminders({ now = new Date(), dryRun = false } = {}) {
  const families = await query(
    `SELECT id, name, timezone, meal_times, notify_lead_minutes
       FROM families WHERE notify_enabled = true`
  );

  const results = [];

  for (const family of families.rows) {
    const timeZone = family.timezone || 'Europe/Paris';
    const today = todayIn(timeZone);
    const nowMinutes = minutesOfDayIn(timeZone, now);
    const mealTimes = { ...DEFAULT_MEAL_TIMES, ...(family.meal_times || {}) };

    // 今天这一天的安排（不管属于本周还是下一周那张菜单）
    const slots = await query(
      `SELECT ms.meal_slot, ms.is_eat_out, ms.recipe_name, r.time_minutes, r.is_store_bought
         FROM menu_slots ms
         JOIN weekly_menus wm ON wm.id = ms.weekly_menu_id
         LEFT JOIN recipes r ON r.id = ms.recipe_id
        WHERE wm.family_id = $1 AND ms.date = $2`,
      [family.id, today]
    );
    if (slots.rows.length === 0) continue;

    for (const meal of MEAL_SLOTS) {
      const rows = slots.rows.filter((r) => r.meal_slot === meal);
      if (rows.length === 0) continue;
      // 出去吃不用做饭，不提醒
      if (rows.some((r) => r.is_eat_out)) continue;

      const dishes = rows.filter((r) => r.recipe_name).map((r) => r.recipe_name);
      if (dishes.length === 0) continue;

      // 买现成的没有"做"的耗时，只按家庭设置的提前量走
      const maxCook = Math.max(
        0,
        ...rows.map((r) => (r.is_store_bought ? 0 : Number(r.time_minutes) || 0))
      );
      const mealMinutes = parseHHMM(mealTimes[meal], parseHHMM(DEFAULT_MEAL_TIMES[meal], 12 * 60));
      const { due, lead, notifyAt } = shouldNotify({
        nowMinutes,
        mealMinutes,
        leadMinutes: family.notify_lead_minutes,
        maxCookMinutes: maxCook,
      });
      if (!due) continue;

      // 抢锁式去重：插得进去才是"这一顿还没提醒过"
      const claimed = await query(
        `INSERT INTO notification_log (family_id, date, meal_slot) VALUES ($1,$2,$3)
         ON CONFLICT (family_id, date, meal_slot) DO NOTHING
         RETURNING id`,
        [family.id, today, meal]
      );
      if (claimed.rows.length === 0) continue;

      const payload = {
        title: `${meal} 该准备了`,
        body: dishes.join('、'),
        mealSlot: meal,
        date: today,
        url: '/menu',
      };

      if (dryRun) {
        results.push({ familyId: family.id, meal, dishes, lead, notifyAt, dryRun: true });
        continue;
      }

      const subs = await query(
        `SELECT ps.endpoint, ps.p256dh, ps.auth
           FROM push_subscriptions ps
           JOIN users u ON u.id = ps.user_id
          WHERE u.family_id = $1`,
        [family.id]
      );
      const { sent, removed } = await sendToSubscriptions(subs.rows, payload);
      console.log(
        `[reminder] 家庭 ${family.id} ${today} ${meal}：${dishes.join('、')}（提前 ${lead} 分钟）-> 发了 ${sent} 台设备${removed ? `，清理 ${removed} 个失效订阅` : ''}`
      );
      results.push({ familyId: family.id, meal, dishes, lead, notifyAt, sent, removed });
    }
  }

  return results;
}

const TICK_MS = 60 * 1000;

export function startMealReminderLoop() {
  const tick = () =>
    runMealReminders().catch((err) => console.error('[reminder] 这一轮出错：', err));
  tick();
  const timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  console.log('[reminder] 做饭提醒已启动（每分钟检查一次）');
  return () => clearInterval(timer);
}
