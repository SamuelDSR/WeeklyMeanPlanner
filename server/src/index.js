import 'dotenv/config';
import express from 'express';
import { query } from './db.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import recipeRoutes from './routes/recipes.js';
import menuRoutes from './routes/menu.js';
import shoppingRoutes from './routes/shopping.js';
import adminRoutes from './routes/admin.js';
import unitRoutes from './routes/units.js';
import familyRoutes from './routes/family.js';
import historyRoutes from './routes/history.js';
import pushRoutes from './routes/push.js';
import stapleRoutes from './routes/staples.js';
import recipeImportRoutes from './routes/recipeImport.js';
import cardRoutes from './routes/cards.js';
import ledgerRoutes from './routes/ledgers.js';
import expenseRoutes from './routes/expenses.js';

import { runMigrations } from './migrate.js';
import { bootstrapAdmin } from './adminBootstrap.js';
import { initPush } from './push.js';
import { startMealReminderLoop } from './mealReminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 部署在反向代理（nginx）后面时需要这个，
// 这样 Express 才能正确识别 https（用来判断 cookie 的 secure 标志、req.protocol 等）
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// 开发模式下前端跑在 Vite dev server（不同端口），需要允许带 cookie 的跨域请求
if (process.env.NODE_ENV !== 'production') {
  app.use(
    cors({
      origin: process.env.DEV_FRONTEND_ORIGIN || 'http://localhost:5173',
      credentials: true,
    })
  );
}

// 图片静态目录
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/recipes/import', recipeImportRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/shopping', shoppingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/staples', stapleRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/ledgers', ledgerRoutes);
app.use('/api/expenses', expenseRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// 生产模式：托管前端打包产物（Dockerfile 里会把 frontend 的 dist 拷到这里）
const PUBLIC_DIR = path.join(__dirname, '../public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { maxAge: '1d', index: false }));
  // SPA 兜底路由：所有非 /api、/uploads 的路径都返回 index.html，交给前端路由处理
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

// 统一错误处理（比如 multer 文件太大之类的错误）
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || '服务器出错了' });
});

const PORT = process.env.PORT || 3000;

// 等数据库可用。
//
// docker compose 里有 depends_on: service_healthy 保证顺序，但**swarm 会忽略它** ——
// 在 swarm 里 api 很可能比 postgres 先起来。不等的话进程直接退出、被反复重启，
// 日志里全是启动失败。这里退避重试，等到连上为止。
async function waitForDatabase({ attempts = 30, delayMs = 2000 } = {}) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await query('SELECT 1');
      if (i > 1) console.log(`[db] 第 ${i} 次尝试连上了`);
      return;
    } catch (err) {
      if (i === attempts) throw new Error(`数据库连不上（试了 ${attempts} 次）：${err.message}`);
      if (i === 1) console.log('[db] 数据库还没就绪，等它起来…');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// 先把数据库结构补到最新、确认管理员账号，再开始收请求
async function start() {
  await waitForDatabase();
  await runMigrations();
  await bootstrapAdmin();
  await initPush();
  startMealReminderLoop();
  app.listen(PORT, () => {
    console.log(`食谱管家 API 已启动，监听端口 ${PORT}`);
  });
}

start().catch((err) => {
  console.error('启动失败：', err);
  process.exit(1);
});
