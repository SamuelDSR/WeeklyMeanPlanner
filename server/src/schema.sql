-- 食谱管家数据库结构
-- 这个文件会在 Postgres 容器第一次启动、数据目录为空时自动执行
-- （docker-compose 里挂在 /docker-entrypoint-initdb.d/ 下）

CREATE TABLE families (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE,
  member_count INTEGER NOT NULL DEFAULT 2,          -- 家里几口人
  owner_id     INTEGER,                             -- 创建者（外键在 users 建好之后再加）
  timezone     TEXT NOT NULL DEFAULT 'Europe/Paris', -- 决定「本周」「今天」是哪一天
  meal_times   JSONB NOT NULL DEFAULT '{"午餐":"12:00","晚餐":"19:00"}'::jsonb,
  notify_enabled      BOOLEAN NOT NULL DEFAULT false,
  notify_lead_minutes INTEGER NOT NULL DEFAULT 60,
  -- 默认主食（外键在 staples 建好之后再加）和「哪几顿配主食」
  default_staple_id   INTEGER,
  staple_meals        TEXT[] NOT NULL DEFAULT '{午餐,晚餐}',
  currency            TEXT NOT NULL DEFAULT 'EUR',   -- 记账用的默认货币
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT families_member_count_check CHECK (member_count >= 1),
  CONSTRAINT families_notify_lead_check CHECK (notify_lead_minutes BETWEEN 0 AND 1440)
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  family_id     INTEGER REFERENCES families(id) ON DELETE SET NULL,
  -- 注册后默认 pending，必须由管理员审核通过才能登录
  status        TEXT NOT NULL DEFAULT 'pending',
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  approved_at   TIMESTAMPTZ,
  approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX idx_users_status ON users(status);

-- 迁移记录表：跑过的迁移名记在这里，migrate.js 只会执行没跑过的
-- 新建的库结构已经是最新的，所以把已有迁移直接标记成"已应用"（基线）
CREATE TABLE schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (name) VALUES
  ('001_user_approval'), ('002_recipe_thumb'),
  ('003_servings_multi_dish_step_photos'), ('004_family_owner'), ('005_store_bought'),
  ('006_eat_out_history_ratings'), ('007_meal_likes_history_survives'),
  ('008_health_snapshot_drop_soup_slot'), ('009_family_timezone'), ('010_notifications'),
  ('011_optional_ingredients_staples'), ('012_drop_breakfast_slot'),
  ('013_cards_and_ledgers'), ('014_income_and_categories');

-- families.owner_id -> users.id：两张表互相引用，所以等 users 建完再补这个外键
ALTER TABLE families
  ADD CONSTRAINT families_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE recipes (
  id               SERIAL PRIMARY KEY,
  family_id        INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT '',
  meals            TEXT[] NOT NULL DEFAULT '{}',        -- 例如 {午餐,晚餐}
  time_minutes     INTEGER NOT NULL DEFAULT 0,
  servings         INTEGER NOT NULL DEFAULT 4,          -- 一份够几人吃
  is_store_bought  BOOLEAN NOT NULL DEFAULT false,      -- 买现成的，不用做
  health_score     SMALLINT,                            -- 健康分 1-5（菜本身的属性）
  like_score       SMALLINT,                            -- 默认喜好分 1-5，某一顿可以单独覆盖
  tags             TEXT[] NOT NULL DEFAULT '{}',
  last_cooked_date DATE,
  photo_url        TEXT,                                 -- 主图 1600px
  thumb_url        TEXT,                                 -- 缩略图 400px，列表用
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipes_servings_check CHECK (servings >= 1),
  CONSTRAINT recipes_health_score_check CHECK (health_score IS NULL OR health_score BETWEEN 1 AND 5),
  CONSTRAINT recipes_like_score_check CHECK (like_score IS NULL OR like_score BETWEEN 1 AND 5)
);
CREATE INDEX idx_recipes_family ON recipes(family_id);

CREATE TABLE ingredients (
  id         SERIAL PRIMARY KEY,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  amount     NUMERIC NOT NULL DEFAULT 0,
  unit       TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT '其他',
  -- 可选食材：有更好，没有也能做（香菜、辣椒这种）。购物清单里单独标出来。
  is_optional BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ingredients_recipe ON ingredients(recipe_id);

CREATE TABLE steps (
  id            SERIAL PRIMARY KEY,
  recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  timer_seconds INTEGER NOT NULL DEFAULT 0,
  photo_url     TEXT,                                   -- 步骤配图（可选）
  thumb_url     TEXT
);
CREATE INDEX idx_steps_recipe ON steps(recipe_id);

-- 每周菜谱：一个家庭每个自然周一份，week_start = 周一日期
CREATE TABLE weekly_menus (
  id           SERIAL PRIMARY KEY,
  family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,
  confirmed_at TIMESTAMPTZ,                            -- 确认过的周才算历史
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_id, week_start)
);
CREATE INDEX idx_weekly_menus_family_week ON weekly_menus(family_id, week_start DESC);

CREATE TABLE menu_slots (
  id              SERIAL PRIMARY KEY,
  weekly_menu_id  INTEGER NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  weekday         TEXT NOT NULL,       -- 周一 ~ 周日
  meal_slot       TEXT NOT NULL,       -- 午餐/晚餐（早餐不排，见迁移 012）
  -- SET NULL 而不是 CASCADE：菜谱被删掉，过去几周的记录要留着
  recipe_id       INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  recipe_name     TEXT,                                -- 菜名快照，菜谱删了也认得
  is_eat_out      BOOLEAN NOT NULL DEFAULT false,      -- 出去吃：不做饭也不买菜
  like_score      SMALLINT,                            -- 这一顿的喜好分，覆盖菜谱上的默认值
  health_score    SMALLINT,                            -- 健康分快照，菜谱删了的兜底
  -- 一顿可以配好几道菜；空格子就是没有行
  CONSTRAINT menu_slots_slot_recipe_key UNIQUE (weekly_menu_id, date, meal_slot, recipe_id),
  -- 一行要么是一道菜（以菜名快照为准），要么是「出去吃」
  CONSTRAINT menu_slots_entry_check CHECK (
    (is_eat_out AND recipe_id IS NULL AND recipe_name IS NULL)
    OR (NOT is_eat_out AND recipe_name IS NOT NULL)
  ),
  CONSTRAINT menu_slots_like_score_check CHECK (like_score IS NULL OR like_score BETWEEN 1 AND 5),
  CONSTRAINT menu_slots_health_score_check CHECK (health_score IS NULL OR health_score BETWEEN 1 AND 5)
);
-- 一格最多一个「出去吃」标记
CREATE UNIQUE INDEX menu_slots_eat_out_key
  ON menu_slots (weekly_menu_id, date, meal_slot) WHERE is_eat_out;
CREATE INDEX idx_menu_slots_menu ON menu_slots(weekly_menu_id);

-- 主食：米饭 / 面条 / 意面这些，和菜一起吃。
--
-- 为什么不塞进 recipes：算量的方式根本不同。
--   菜   一份够 4 人 -> 整份做 -> ceil(顿数 x 人数 / 4)
--   主食 每人 75 g   -> 线性  -> 75 x 人数 x 顿数
CREATE TABLE staples (
  id                SERIAL PRIMARY KEY,
  family_id         INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  amount_per_person NUMERIC NOT NULL DEFAULT 75,      -- 一个人一顿吃多少（生重）
  unit              TEXT NOT NULL DEFAULT 'g',
  category          TEXT NOT NULL DEFAULT '干货粮油',  -- 购物清单里归到哪一类
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staples_amount_check CHECK (amount_per_person > 0)
);
CREATE INDEX idx_staples_family ON staples(family_id);

ALTER TABLE families
  ADD CONSTRAINT families_default_staple_fkey
  FOREIGN KEY (default_staple_id) REFERENCES staples(id) ON DELETE SET NULL;

-- 某一顿单独指定的主食。**没有行 = 用家庭默认**，这张表只存「例外」：
--   周三改吃意面 -> 一行 staple_id=意面 ；周四不要主食 -> 一行 is_none=true
CREATE TABLE menu_staples (
  id                SERIAL PRIMARY KEY,
  weekly_menu_id    INTEGER NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  meal_slot         TEXT NOT NULL,
  -- 主食被删掉时靠这几个快照兜底（和 menu_slots.recipe_name 一个思路）
  staple_id         INTEGER REFERENCES staples(id) ON DELETE SET NULL,
  staple_name       TEXT,
  amount_per_person NUMERIC,
  unit              TEXT,
  category          TEXT,
  is_none           BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (weekly_menu_id, date, meal_slot),
  CONSTRAINT menu_staples_entry_check CHECK (
    (is_none AND staple_name IS NULL) OR (NOT is_none AND staple_name IS NOT NULL)
  )
);
CREATE INDEX idx_menu_staples_menu ON menu_staples(weekly_menu_id);

CREATE TABLE shopping_lists (
  id         SERIAL PRIMARY KEY,
  family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_id, week_start)
);

CREATE TABLE shopping_list_items (
  id                SERIAL PRIMARY KEY,
  shopping_list_id  INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT '其他',
  qty               NUMERIC NOT NULL DEFAULT 0,
  unit              TEXT NOT NULL DEFAULT '',
  -- 可选食材单独成行，和必买的分开勾
  is_optional       BOOLEAN NOT NULL DEFAULT false,
  checked           BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_shopping_items_list ON shopping_list_items(shopping_list_id);

-- 浏览器推送订阅：一台设备一条（endpoint 会失效，推送返回 410/404 时删掉）
CREATE TABLE push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- 已发过的提醒：同一顿饭只提醒一次（定时器每分钟跑，进程还可能重启）
CREATE TABLE notification_log (
  id         SERIAL PRIMARY KEY,
  family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  meal_slot  TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, date, meal_slot)
);

-- 一点点全局配置（目前只放自动生成的 VAPID 密钥对）
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------- 会员卡 ----------
-- 超市积分卡这些，实体卡就是一串码。存下来，结账时调出来给扫码枪看。
CREATE TABLE loyalty_cards (
  id          SERIAL PRIMARY KEY,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  code_format TEXT NOT NULL DEFAULT 'CODE128',
  note        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'indigo',
  photo_url   TEXT,                                  -- 码扫不出来时给收银员看实拍
  thumb_url   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loyalty_cards_family ON loyalty_cards(family_id);

-- ---------- 记账 ----------
-- 子账本：度假、装修这类有起止的开销集合。
-- 没有"主账本"这张表 —— 主账本就是这个家庭本身：
-- expenses.ledger_id 为空就是日常开销，总账 = 全部 expenses。
CREATE TABLE ledgers (
  id          SERIAL PRIMARY KEY,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  starts_on   DATE,
  ends_on     DATE,
  currency    TEXT,                                  -- 不填就跟家庭默认
  archived_at TIMESTAMPTZ,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ledgers_dates_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX idx_ledgers_family ON ledgers(family_id);

CREATE TABLE expenses (
  id           SERIAL PRIMARY KEY,
  family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  -- 子账本删掉时开销不跟着消失，只是回到「日常」
  ledger_id    INTEGER REFERENCES ledgers(id) ON DELETE SET NULL,
  spent_on     DATE NOT NULL,
  -- 金额一律存正数，收还是支由 kind 决定。用正负号表方向的话，
  -- 一个 SUM 就把收支混成一个数了，看不出到底花了多少。
  kind         TEXT NOT NULL DEFAULT 'expense',
  amount       NUMERIC(12,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  category     TEXT NOT NULL DEFAULT '其他',
  note         TEXT NOT NULL DEFAULT '',
  paid_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_by_name TEXT,                                 -- 名字快照，人删了记录还认得
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_check CHECK (amount <> 0),
  CONSTRAINT expenses_kind_check CHECK (kind IN ('expense', 'income'))
);
CREATE INDEX idx_expenses_kind ON expenses(family_id, kind, spent_on DESC);
CREATE INDEX idx_expenses_family_date ON expenses(family_id, spent_on DESC);
CREATE INDEX idx_expenses_ledger ON expenses(ledger_id);
