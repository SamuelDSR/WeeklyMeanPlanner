// 极简迁移机制：每条迁移只跑一次，跑过的名字记在 schema_migrations 表里。
//
// 新建的库由 schema.sql 一次建成最新结构，并把已有迁移名预先写进 schema_migrations，
// 所以下面的 SQL 只会在"升级一个已经存在的库"时真正执行：
//
//   新库   schema.sql（最新结构 + 迁移基线）  ->  migrate 无事可做
//   老库   已有结构                          ->  migrate 补上缺的列
import { pool } from './db.js';

// 同一个库上如果同时启动了多个实例，用这把咨询锁保证迁移串行执行
const MIGRATION_LOCK_ID = 728341;

const MIGRATIONS = [
  {
    name: '001_user_approval',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin    BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

      -- 升级前就存在的用户一律视为已通过审核，否则升级完老用户会被关在门外
      UPDATE users SET status = 'approved', approved_at = COALESCE(approved_at, now())
       WHERE status = 'pending';

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check') THEN
          ALTER TABLE users ADD CONSTRAINT users_status_check
            CHECK (status IN ('pending', 'approved', 'rejected'));
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    `,
  },
  {
    name: '002_recipe_thumb',
    sql: `
      -- 缩略图地址。老数据是 NULL，前端会退回用主图，不会显示不出来。
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS thumb_url TEXT;
    `,
  },
  {
    name: '003_servings_multi_dish_step_photos',
    sql: `
      -- 一份菜谱做出来够几个人吃
      ALTER TABLE recipes  ADD COLUMN IF NOT EXISTS servings     INTEGER NOT NULL DEFAULT 4;
      -- 家里几口人：菜单换算成"要做几份"时要用
      ALTER TABLE families ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 2;
      -- 步骤配图
      ALTER TABLE steps    ADD COLUMN IF NOT EXISTS photo_url    TEXT;
      ALTER TABLE steps    ADD COLUMN IF NOT EXISTS thumb_url    TEXT;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_servings_check') THEN
          ALTER TABLE recipes ADD CONSTRAINT recipes_servings_check CHECK (servings >= 1);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'families_member_count_check') THEN
          ALTER TABLE families ADD CONSTRAINT families_member_count_check CHECK (member_count >= 1);
        END IF;
      END $$;

      -- 一格一道菜的限制去掉：现在一顿可以配好几道菜。
      -- 空格子不再用 recipe_id IS NULL 的行表示，而是干脆没有行。
      ALTER TABLE menu_slots DROP CONSTRAINT IF EXISTS menu_slots_weekly_menu_id_date_meal_slot_key;
      DELETE FROM menu_slots WHERE recipe_id IS NULL;

      -- 菜谱被删掉时，它占的格子直接消失（以前会留一行 recipe_id = NULL）
      ALTER TABLE menu_slots DROP CONSTRAINT IF EXISTS menu_slots_recipe_id_fkey;
      ALTER TABLE menu_slots ADD CONSTRAINT menu_slots_recipe_id_fkey
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
      ALTER TABLE menu_slots ALTER COLUMN recipe_id SET NOT NULL;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_slots_slot_recipe_key') THEN
          -- 同一格里同一道菜不重复（想多做点是调菜谱的"份数"，不是加两遍）
          ALTER TABLE menu_slots ADD CONSTRAINT menu_slots_slot_recipe_key
            UNIQUE (weekly_menu_id, date, meal_slot, recipe_id);
        END IF;
      END $$;
    `,
  },
  {
    name: '004_family_owner',
    sql: `
      -- 家庭的创建者：只有他（和应用管理员）能改家庭设置、踢人、换邀请码
      ALTER TABLE families ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

      -- 升级前建的家庭没有记创建者，把最早加入的成员当作创建者
      UPDATE families f
         SET owner_id = (SELECT u.id FROM users u WHERE u.family_id = f.id ORDER BY u.id LIMIT 1)
       WHERE f.owner_id IS NULL;
    `,
  },
  {
    name: '005_store_bought',
    sql: `
      -- 买现成的（熟食/半成品）：不用做，直接买。
      -- 它的"食材"就只有它自己一行，记着一份要买多少（1 盒 / 500 g / 2 个…），
      -- 这样份数换算和购物清单合并都能直接复用，不用另开一套逻辑。
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_store_bought BOOLEAN NOT NULL DEFAULT false;
    `,
  },
  {
    name: '006_eat_out_history_ratings',
    sql: `
      -- 「出去吃」：这一格不做饭，也不进购物清单。
      -- 它是一行 recipe_id 为空、is_eat_out 为真的记录。
      ALTER TABLE menu_slots ALTER COLUMN recipe_id DROP NOT NULL;
      ALTER TABLE menu_slots ADD COLUMN IF NOT EXISTS is_eat_out BOOLEAN NOT NULL DEFAULT false;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_slots_entry_check') THEN
          -- 一行要么是一道菜，要么是「出去吃」，不会两者都是或都不是
          ALTER TABLE menu_slots ADD CONSTRAINT menu_slots_entry_check CHECK (
            (is_eat_out AND recipe_id IS NULL) OR (NOT is_eat_out AND recipe_id IS NOT NULL)
          );
        END IF;
      END $$;

      -- 一格最多一个「出去吃」标记（recipe_id 为 NULL 时那个 UNIQUE 约束管不住）
      CREATE UNIQUE INDEX IF NOT EXISTS menu_slots_eat_out_key
        ON menu_slots (weekly_menu_id, date, meal_slot) WHERE is_eat_out;

      -- 确认菜单（「这周就这么吃」）。确认过的周才算历史。
      ALTER TABLE weekly_menus ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

      -- 健康分 / 喜好分：1-5，NULL = 还没评
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS health_score SMALLINT;
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS like_score   SMALLINT;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_health_score_check') THEN
          ALTER TABLE recipes ADD CONSTRAINT recipes_health_score_check
            CHECK (health_score IS NULL OR health_score BETWEEN 1 AND 5);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_like_score_check') THEN
          ALTER TABLE recipes ADD CONSTRAINT recipes_like_score_check
            CHECK (like_score IS NULL OR like_score BETWEEN 1 AND 5);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_weekly_menus_family_week ON weekly_menus(family_id, week_start DESC);
    `,
  },
  {
    name: '007_meal_likes_history_survives',
    sql: `
      -- 1) 历史要活下来：删一道菜不能把过去几周的记录一起带走。
      --    办法是在格子上存一份菜名快照，菜谱删了也知道那天吃的是什么。
      ALTER TABLE menu_slots ADD COLUMN IF NOT EXISTS recipe_name TEXT;
      UPDATE menu_slots ms
         SET recipe_name = r.name
        FROM recipes r
       WHERE r.id = ms.recipe_id AND ms.recipe_name IS NULL;

      -- 判断"这行是一道菜"从此看菜名快照，而不是看 recipe_id ——
      -- 不然 ON DELETE SET NULL 把 recipe_id 清空时会撞上原来的 CHECK，导致删菜谱直接失败
      ALTER TABLE menu_slots DROP CONSTRAINT IF EXISTS menu_slots_entry_check;
      ALTER TABLE menu_slots ADD CONSTRAINT menu_slots_entry_check CHECK (
        (is_eat_out AND recipe_id IS NULL AND recipe_name IS NULL)
        OR (NOT is_eat_out AND recipe_name IS NOT NULL)
      );

      ALTER TABLE menu_slots DROP CONSTRAINT IF EXISTS menu_slots_recipe_id_fkey;
      ALTER TABLE menu_slots ADD CONSTRAINT menu_slots_recipe_id_fkey
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;

      -- 2) 喜好分挪到"这一顿"上。菜谱上的 like_score 保留，当默认值用：
      --    这一顿没单独评过，就用菜谱上的。
      ALTER TABLE menu_slots ADD COLUMN IF NOT EXISTS like_score SMALLINT;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_slots_like_score_check') THEN
          ALTER TABLE menu_slots ADD CONSTRAINT menu_slots_like_score_check
            CHECK (like_score IS NULL OR like_score BETWEEN 1 AND 5);
        END IF;
      END $$;
    `,
  },
  {
    name: '008_health_snapshot_drop_soup_slot',
    sql: `
      -- 健康分快照：菜谱被删掉之后，历史里也还知道那顿吃得健不健康。
      -- 菜谱还在的时候以菜谱上的为准（健康程度是菜本身的属性，改了应该全局生效），
      -- 快照只是删掉之后的兜底。
      ALTER TABLE menu_slots ADD COLUMN IF NOT EXISTS health_score SMALLINT;
      UPDATE menu_slots ms
         SET health_score = r.health_score
        FROM recipes r
       WHERE r.id = ms.recipe_id AND ms.health_score IS NULL;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_slots_health_score_check') THEN
          ALTER TABLE menu_slots ADD CONSTRAINT menu_slots_health_score_check
            CHECK (health_score IS NULL OR health_score BETWEEN 1 AND 5);
        END IF;
      END $$;

      -- 去掉「汤羹」这个餐次：表单里从来没提供过它当餐次（只有早/午/晚），
      -- 所以这些格子一直是空的。「汤羹」作为菜品分类保留不动。
      DELETE FROM menu_slots WHERE meal_slot = '汤羹';
      UPDATE recipes SET meals = array_remove(meals, '汤羹') WHERE '汤羹' = ANY(meals);
    `,
  },
  {
    name: '009_family_timezone',
    sql: `
      -- 「本周」是哪一周取决于时区：容器跑在 UTC，但家在巴黎。
      -- 没有这个设置的话，UTC 时间周一凌晨 00:30（巴黎已是周一 02:30）算哪一周都可能错。
      ALTER TABLE families ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Paris';
    `,
  },
  {
    name: '010_notifications',
    sql: `
      -- 每顿饭的钟点（家庭设置）。做成 JSONB 而不是三列：
      -- 餐次本来就是一组可变的键，加一顿"下午茶"不用再改表。
      ALTER TABLE families ADD COLUMN IF NOT EXISTS meal_times JSONB
        NOT NULL DEFAULT '{"早餐":"08:00","午餐":"12:00","晚餐":"19:00"}'::jsonb;
      -- 通知总开关 + 提前多久（分钟）。默认关：不该有人被没同意过的推送吵到。
      ALTER TABLE families ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE families ADD COLUMN IF NOT EXISTS notify_lead_minutes INTEGER NOT NULL DEFAULT 60;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'families_notify_lead_check') THEN
          ALTER TABLE families ADD CONSTRAINT families_notify_lead_check
            CHECK (notify_lead_minutes BETWEEN 0 AND 1440);
        END IF;
      END $$;

      -- 浏览器推送订阅：一台设备一条。endpoint 是浏览器厂商推送服务给的地址，
      -- 唯一，而且会失效（用户撤权限、清数据、删掉主屏图标…），失效时推送会返回
      -- 410/404，那时要把这一行删掉。
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint     TEXT NOT NULL UNIQUE,
        p256dh       TEXT NOT NULL,
        auth         TEXT NOT NULL,
        user_agent   TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_sent_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

      -- 已发过的提醒。定时器每分钟跑一次、进程可能重启，
      -- 靠这张表保证"同一顿饭只提醒一次"。
      CREATE TABLE IF NOT EXISTS notification_log (
        id         SERIAL PRIMARY KEY,
        family_id  INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        date       DATE NOT NULL,
        meal_slot  TEXT NOT NULL,
        sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (family_id, date, meal_slot)
      );

      -- 一点点全局配置（目前只放自动生成的 VAPID 密钥对）
      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    name: '011_optional_ingredients_staples',
    sql: `
      -- 1) 可选食材：有更好，没有也能做（香菜、辣椒这种）
      ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_optional BOOLEAN NOT NULL DEFAULT false;
      -- 购物清单里可选的单独成行（"土豆 1000 g" 和 "土豆 200 g 可选" 分开勾），
      -- 免得把可有可无的量混进必买的总量里
      ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS is_optional BOOLEAN NOT NULL DEFAULT false;

      -- 2) 主食：米饭 / 面条 / 意面这些，和菜一起吃。
      --    和菜的算法完全不同 —— 菜是整份做的（ceil），主食是按人按顿线性算的，
      --    所以不能塞进 recipes 里，单独一张表。
      CREATE TABLE IF NOT EXISTS staples (
        id                SERIAL PRIMARY KEY,
        family_id         INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        name              TEXT NOT NULL,
        amount_per_person NUMERIC NOT NULL DEFAULT 75,   -- 一个人一顿吃多少（生重）
        unit              TEXT NOT NULL DEFAULT 'g',
        category          TEXT NOT NULL DEFAULT '干货粮油', -- 购物清单里归到哪一类
        sort_order        INTEGER NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT staples_amount_check CHECK (amount_per_person > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_staples_family ON staples(family_id);

      -- 家庭的默认主食 + 哪几顿配主食。绝大多数情况「晚饭吃米饭」不用点任何按钮。
      ALTER TABLE families ADD COLUMN IF NOT EXISTS default_staple_id INTEGER
        REFERENCES staples(id) ON DELETE SET NULL;
      ALTER TABLE families ADD COLUMN IF NOT EXISTS staple_meals TEXT[] NOT NULL
        DEFAULT '{午餐,晚餐}';

      -- 某一顿单独指定的主食。**没有行 = 用家庭默认**，所以这张表只存「例外」：
      --   周三改吃意面   -> 一行，staple_id = 意面
      --   周四不要主食   -> 一行，is_none = true
      CREATE TABLE IF NOT EXISTS menu_staples (
        id                SERIAL PRIMARY KEY,
        weekly_menu_id    INTEGER NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
        date              DATE NOT NULL,
        meal_slot         TEXT NOT NULL,
        -- 主食被删掉时，靠下面几个快照字段兜底（和 menu_slots 的 recipe_name 一个思路）
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
      CREATE INDEX IF NOT EXISTS idx_menu_staples_menu ON menu_staples(weekly_menu_id);

      -- 3) 给每个已有家庭建一套常见主食，并把米饭设成默认。
      --    这样升级完打开应用就能直接用，不用先去设置页配一遍。
      INSERT INTO staples (family_id, name, amount_per_person, unit, category, sort_order)
      SELECT f.id, v.name, v.amt, v.unit, '干货粮油', v.ord
        FROM families f
        CROSS JOIN (VALUES
          ('米饭', 75,  'g', 0),
          ('面条', 100, 'g', 1),
          ('意面', 100, 'g', 2),
          ('馒头', 1,   '个', 3)
        ) AS v(name, amt, unit, ord)
       WHERE NOT EXISTS (SELECT 1 FROM staples s WHERE s.family_id = f.id);

      UPDATE families f SET default_staple_id = (
        SELECT s.id FROM staples s WHERE s.family_id = f.id AND s.name = '米饭'
         ORDER BY s.id LIMIT 1
      ) WHERE f.default_staple_id IS NULL;
    `,
  },
  {
    name: '012_drop_breakfast_slot',
    sql: `
      -- 去掉「早餐」这个餐次：早饭各人各吃，没必要排进每周计划里。
      -- 现在只排 午餐 / 晚餐。
      --
      -- 历史里如果真有早餐记录，删掉就等于丢数据，所以这里只删「还没确认」的周；
      -- 已经归档的周原样留着，历史页照旧显示（餐次名是跟着数据走的，不依赖 MEAL_SLOTS）。
      DELETE FROM menu_staples
       WHERE meal_slot = '早餐'
         AND weekly_menu_id IN (SELECT id FROM weekly_menus WHERE confirmed_at IS NULL);
      DELETE FROM menu_slots
       WHERE meal_slot = '早餐'
         AND weekly_menu_id IN (SELECT id FROM weekly_menus WHERE confirmed_at IS NULL);

      -- 菜谱上的「适合早餐」标记去掉。
      -- 只标了早餐的菜会变成空数组 —— 那样它既不会被自动排菜选中、也没法手动加进任何一格，
      -- 等于悄悄消失，所以兜底给成 午餐+晚餐。
      UPDATE recipes SET meals = array_remove(meals, '早餐') WHERE '早餐' = ANY(meals);
      UPDATE recipes SET meals = '{午餐,晚餐}' WHERE cardinality(meals) = 0;

      -- 家庭设置里的早餐时间和「早餐配主食」一并去掉
      UPDATE families SET meal_times = meal_times - '早餐' WHERE meal_times ? '早餐';
      UPDATE families SET staple_meals = array_remove(staple_meals, '早餐')
       WHERE '早餐' = ANY(staple_meals);

      -- 新建家庭的默认餐次时间也不要早餐了
      ALTER TABLE families ALTER COLUMN meal_times
        SET DEFAULT '{"午餐":"12:00","晚餐":"19:00"}'::jsonb;

      -- 早餐的提醒记录没用了（这张表只用来防重复发送）
      DELETE FROM notification_log WHERE meal_slot = '早餐';
    `,
  },
  {
    name: '013_cards_and_ledgers',
    sql: `
      -- ---------- 会员卡 ----------
      -- 超市积分卡、药店卡这些，实体卡就是一串码。存下来，结账时调出来给扫码枪看。
      CREATE TABLE IF NOT EXISTS loyalty_cards (
        id          SERIAL PRIMARY KEY,
        family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,                    -- 卡的名字，比如 Carrefour
        code        TEXT NOT NULL,                    -- 卡号 / 码的内容
        code_format TEXT NOT NULL DEFAULT 'CODE128',  -- CODE128 / EAN13 / QR ...
        note        TEXT NOT NULL DEFAULT '',
        color       TEXT NOT NULL DEFAULT 'indigo',   -- 列表里好认
        -- 码印得太糊扫不出来时，还能给收银员看实拍照片
        photo_url   TEXT,
        thumb_url   TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_loyalty_cards_family ON loyalty_cards(family_id);

      -- ---------- 记账 ----------
      -- 子账本：度假、装修这类有起止的开销集合。
      -- **没有"主账本"这张表** —— 主账本就是这个家庭本身：
      -- expenses.ledger_id 为空就是日常开销，总账 = 全部 expenses。
      -- 这样「度假花了多少」和「这个月一共花了多少（含度假）」两个问题都能答。
      CREATE TABLE IF NOT EXISTS ledgers (
        id          SERIAL PRIMARY KEY,
        family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        note        TEXT NOT NULL DEFAULT '',
        starts_on   DATE,
        ends_on     DATE,
        -- 出国度假可能用别的货币；不填就跟家庭默认
        currency    TEXT,
        archived_at TIMESTAMPTZ,
        created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ledgers_dates_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
      );
      CREATE INDEX IF NOT EXISTS idx_ledgers_family ON ledgers(family_id);

      CREATE TABLE IF NOT EXISTS expenses (
        id          SERIAL PRIMARY KEY,
        family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        -- 子账本删掉时开销不跟着消失，只是回到「日常」
        ledger_id   INTEGER REFERENCES ledgers(id) ON DELETE SET NULL,
        spent_on    DATE NOT NULL,
        amount      NUMERIC(12,2) NOT NULL,
        currency    TEXT NOT NULL DEFAULT 'EUR',
        category    TEXT NOT NULL DEFAULT '其他',
        note        TEXT NOT NULL DEFAULT '',
        -- 谁付的钱。人被删掉了记录还要留着，所以 SET NULL + 名字快照
        paid_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        paid_by_name TEXT,
        created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT expenses_amount_check CHECK (amount <> 0)
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_family_date ON expenses(family_id, spent_on DESC);
      CREATE INDEX IF NOT EXISTS idx_expenses_ledger ON expenses(ledger_id);

      -- 家庭默认货币（在法国就是欧元）
      ALTER TABLE families ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR';
    `,
  },
  {
    name: '014_income_and_categories',
    sql: `
      -- 收入。以前只能记支出，但家庭账本里工资、报销、红包也得记，
      -- 否则「这个月剩下多少」这个问题根本答不了。
      --
      -- 金额一律存正数，方向由 kind 决定。用正负号表示方向的话，
      -- 汇总时一个 SUM 就把收支混成一个数了，反而看不出花了多少。
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'expense';

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_kind_check') THEN
          ALTER TABLE expenses ADD CONSTRAINT expenses_kind_check
            CHECK (kind IN ('expense', 'income'));
        END IF;
      END $$;

      -- 以前用负数记的退款，改成正数的收入，语义更清楚
      UPDATE expenses SET kind = 'income', amount = -amount WHERE amount < 0;

      CREATE INDEX IF NOT EXISTS idx_expenses_kind ON expenses(family_id, kind, spent_on DESC);
    `,
  },
  {
    name: '015_offline_sync',
    sql: `
      -- 离线补发用的幂等键。
      --
      -- 场景：手机没信号时记了一笔，请求发出去了但响应没回来。客户端不知道
      -- 服务器到底收没收到，只能重发 —— 没有这个键的话就会记成两笔。
      -- 客户端每条待同步的操作自己生成一个 id，服务器认这个 id：
      -- 已经有了就把原来那条原样返回，而不是再插一条。
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS client_op_id TEXT;

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'expenses_client_op_id_key'
        ) THEN
          CREATE UNIQUE INDEX expenses_client_op_id_key
            ON expenses(client_op_id) WHERE client_op_id IS NOT NULL;
        END IF;
      END $$;
    `,
  },
  {
    name: '016_card_brand',
    sql: `
      -- 卡属于哪个商家（carrefour / picard …）。只存一个 slug，
      -- 名字、品牌色、首字母都在代码里（server/src/cardBrands.js）——
      -- 这样以后想换配色或者补商家，不用动数据库。
      -- 自己加的卡这一列为空，照旧用 color 里的调色板颜色。
      ALTER TABLE loyalty_cards ADD COLUMN IF NOT EXISTS brand TEXT;
    `,
  },
];

async function isApplied(client, name) {
  const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
  return rows.length > 0;
}

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    for (const migration of MIGRATIONS) {
      if (await isApplied(client, migration.name)) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        console.log(`[migrate] 已应用迁移 ${migration.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`迁移 ${migration.name} 执行失败：${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}
