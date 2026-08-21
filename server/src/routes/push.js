// 推送订阅的增删 + 一个"发个测试通知"的接口。
// 订阅是**按设备**的：同一个人手机、平板、电脑各订一份。
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { publicKey, sendToSubscriptions } from '../push.js';

const router = Router();
router.use(requireAuth);

// 前端订阅时需要 VAPID 公钥
router.get('/key', (req, res) => {
  const key = publicKey();
  if (!key) return res.status(503).json({ error: '推送还没初始化好' });
  res.json({ publicKey: key });
});

router.get('/subscriptions', async (req, res) => {
  const r = await query(
    'SELECT id, endpoint, user_agent, created_at, last_sent_at FROM push_subscriptions WHERE user_id=$1 ORDER BY id',
    [req.user.userId]
  );
  res.json({
    subscriptions: r.rows.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      userAgent: s.user_agent,
      createdAt: s.created_at,
      lastSentAt: s.last_sent_at,
    })),
  });
});

router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string' || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: '订阅信息不完整' });
  }
  // 同一个 endpoint 再订一次就更新（换了账号登录、密钥轮换都走这条）
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh  = EXCLUDED.p256dh,
           auth    = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent`,
    [req.user.userId, endpoint, keys.p256dh, keys.auth, String(req.get('user-agent') || '').slice(0, 200)]
  );
  res.json({ ok: true });
});

router.delete('/subscribe', async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: '缺少 endpoint' });
  await query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [
    endpoint,
    req.user.userId,
  ]);
  res.json({ ok: true });
});

// 设置页上的「发个测试通知」：确认这台设备真的收得到
router.post('/test', async (req, res) => {
  const subs = await query(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1',
    [req.user.userId]
  );
  if (subs.rows.length === 0) {
    return res.status(400).json({ error: '这个账号还没有任何设备订阅通知' });
  }
  const { sent, removed } = await sendToSubscriptions(subs.rows, {
    title: '测试通知',
    body: '能看到这条，说明推送通了 🎉',
    url: '/settings',
  });
  res.json({ sent, removed });
});

export default router;
