// 浏览器推送（Web Push）的底座：VAPID 密钥、发送、失效订阅的清理。
//
// VAPID 是一对公私钥，用来向浏览器厂商的推送服务证明"这条推送确实来自这个站点"。
// 公钥要发给前端（订阅时用），私钥只留在服务端。
//
// 密钥优先读环境变量；没配就自动生成一对存进 app_settings —— 这样开箱能用，
// 而且**重启后不变**（如果每次重启都换一对，所有已有订阅会立刻失效）。
import webpush from 'web-push';
import { query } from './db.js';

const SUBJECT_KEY = 'vapid_subject';
const PUBLIC_KEY = 'vapid_public_key';
const PRIVATE_KEY = 'vapid_private_key';

let cachedPublicKey = null;

async function readSetting(key) {
  const r = await query('SELECT value FROM app_settings WHERE key=$1', [key]);
  return r.rows[0]?.value ?? null;
}

async function writeSetting(key, value) {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

export async function initPush() {
  const subject = process.env.VAPID_SUBJECT || (await readSetting(SUBJECT_KEY)) || 'mailto:admin@example.com';

  let publicKey = process.env.VAPID_PUBLIC_KEY || (await readSetting(PUBLIC_KEY));
  let privateKey = process.env.VAPID_PRIVATE_KEY || (await readSetting(PRIVATE_KEY));

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await writeSetting(PUBLIC_KEY, publicKey);
    await writeSetting(PRIVATE_KEY, privateKey);
    console.log('[push] 自动生成了一对 VAPID 密钥并存进数据库（重启不会变）');
  }
  await writeSetting(SUBJECT_KEY, subject);

  webpush.setVapidDetails(subject, publicKey, privateKey);
  cachedPublicKey = publicKey;
  return publicKey;
}

export function publicKey() {
  return cachedPublicKey;
}

// 真正发一条的默认实现。抽成参数是为了能测"失效订阅会被清掉"这条逻辑 ——
// web-push 只走 https，没法在本地伪造一个返回 410 的推送服务。
const defaultSend = (sub, body) =>
  webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    body
  );

// 给一批订阅发同一条推送。失效的（410/404）当场删掉。
// 返回 { sent, removed }
export async function sendToSubscriptions(subscriptions, payload, { send = defaultSend } = {}) {
  let sent = 0;
  const dead = [];
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await send(sub, body);
        sent += 1;
      } catch (err) {
        // 410 Gone / 404 Not Found = 这个订阅没了（撤了权限、清了数据、删了主屏图标…）。
        // 这是唯一的信号，不删就会一直往死地址发。
        if (err.statusCode === 410 || err.statusCode === 404) {
          dead.push(sub.endpoint);
        } else {
          console.error('[push] 发送失败', err.statusCode, err.body || err.message);
        }
      }
    })
  );

  if (dead.length > 0) {
    await query('DELETE FROM push_subscriptions WHERE endpoint = ANY($1)', [dead]);
    console.log(`[push] 清掉 ${dead.length} 个已失效的订阅`);
  }
  if (sent > 0) {
    await query(
      'UPDATE push_subscriptions SET last_sent_at = now() WHERE endpoint = ANY($1)',
      [subscriptions.map((s) => s.endpoint).filter((e) => !dead.includes(e))]
    );
  }
  return { sent, removed: dead.length };
}
