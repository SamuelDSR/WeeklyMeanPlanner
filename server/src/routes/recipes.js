import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pool, query } from '../db.js';
import { requireAuth, requireFamily } from '../auth.js';
import { processRecipeImage, deleteImageFiles } from '../imageProcessor.js';
import { sanitizePhotoURL } from '../validate.js';

const router = Router();
router.use(requireAuth, requireFamily);

const DEFAULT_SERVINGS = 4;

// 评分统一走这里：不是 1-5 的整数就当"没评"
function clampScore(value) {
  const n = Math.floor(Number(value));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 收到的原图先放内存，由 sharp 压缩成主图 + 缩略图之后才落盘，
// 磁盘上不会留下几 MB 的原始照片
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB：现在手机随手一拍就有这么大
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('只能上传图片'));
    cb(null, true);
  },
});

// multer 自己抛的错（文件太大、不是图片）是客户端的问题，
// 不接住的话会掉到全局错误处理里变成 500，用户看到的就是"服务器出错了"
function uploadSingle(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '图片太大了，请换一张小于 12MB 的' });
    }
    return res.status(400).json({ error: err.message || '图片上传失败' });
  });
}

router.post('/upload', uploadSingle, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没收到图片' });

  const baseName = `${req.user.familyId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { photoURL, thumbURL } = await processRecipeImage(req.file.buffer, UPLOAD_DIR, baseName);
    res.json({ photoURL, thumbURL });
  } catch (err) {
    console.error('图片处理失败：', err);
    res.status(400).json({ error: err.message || '图片处理失败，换一张试试' });
  }
});

// 列出菜品库（含食材、步骤）
router.get('/', async (req, res) => {
  const familyId = req.user.familyId;
  // 顺便带上「实际吃过之后的喜好均分」：菜谱上的 like_score 只是默认值，
  // 每一顿单独评过的分才是真实反馈（见 menu_slots.like_score）
  const recipesResult = await query(
    `SELECT r.*, ml.avg_like, ml.rated_count
       FROM recipes r
       LEFT JOIN (
         SELECT recipe_id,
                ROUND(AVG(like_score)::numeric, 1) AS avg_like,
                COUNT(like_score)::int            AS rated_count
           FROM menu_slots
          WHERE like_score IS NOT NULL AND recipe_id IS NOT NULL
          GROUP BY recipe_id
       ) ml ON ml.recipe_id = r.id
      WHERE r.family_id = $1
      ORDER BY r.name`,
    [familyId]
  );
  const recipes = recipesResult.rows;
  if (recipes.length === 0) return res.json({ recipes: [] });

  const ids = recipes.map((r) => r.id);
  const [ingResult, stepResult] = await Promise.all([
    query(`SELECT * FROM ingredients WHERE recipe_id = ANY($1) ORDER BY recipe_id, sort_order`, [ids]),
    query(`SELECT * FROM steps WHERE recipe_id = ANY($1) ORDER BY recipe_id, sort_order`, [ids]),
  ]);

  const ingByRecipe = groupBy(ingResult.rows, 'recipe_id');
  const stepByRecipe = groupBy(stepResult.rows, 'recipe_id');

  res.json({ recipes: recipes.map((r) => toRecipeJson(r, ingByRecipe[r.id], stepByRecipe[r.id])) });
});

router.post('/', async (req, res) => {
  const familyId = req.user.familyId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recipeId = await upsertRecipe(client, familyId, null, req.body);
    await client.query('COMMIT');
    res.json({ id: recipeId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: '保存失败' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const familyId = req.user.familyId;
  const recipeId = Number(req.params.id);
  const owns = await query('SELECT id FROM recipes WHERE id=$1 AND family_id=$2', [recipeId, familyId]);
  if (owns.rows.length === 0) return res.status(404).json({ error: '没找到这道菜' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertRecipe(client, familyId, recipeId, req.body);
    await client.query('COMMIT');
    res.json({ id: recipeId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: '保存失败' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const familyId = req.user.familyId;
  const recipeId = Number(req.params.id);
  // 步骤配图要在删菜谱之前查出来（steps 会被外键级联删掉）
  const stepImages = await query('SELECT photo_url, thumb_url FROM steps WHERE recipe_id=$1', [recipeId]);
  const result = await query(
    'DELETE FROM recipes WHERE id=$1 AND family_id=$2 RETURNING photo_url, thumb_url',
    [recipeId, familyId]
  );
  const row = result.rows[0];
  if (row) {
    await deleteImageFiles(UPLOAD_DIR, [
      row.photo_url,
      row.thumb_url,
      ...stepImages.rows.flatMap((r) => [r.photo_url, r.thumb_url]),
    ]);
  }
  res.json({ ok: true });
});

async function upsertRecipe(client, familyId, recipeId, body) {
  const { name, category, meals, timeMinutes, tags, ingredients = [], steps = [] } = body;
  // 这两个地址是客户端传上来的，只接受 /uploads/<文件名> 的形状
  const photoURL = sanitizePhotoURL(body.photoURL);
  const thumbURL = sanitizePhotoURL(body.thumbURL);
  // 一份做出来够几人吃，至少 1
  const servings = Math.max(1, Math.floor(Number(body.servings) || DEFAULT_SERVINGS));
  const isStoreBought = body.isStoreBought === true;
  // 健康分 / 喜好分：1-5，没评就是 null
  const healthScore = clampScore(body.healthScore);
  const likeScore = clampScore(body.likeScore);

  // 买现成的：没有做法步骤，"食材"就是它自己一行（记着一份要买多少）。
  // 这里在服务端强制成这个形状，不管客户端传了什么，数据始终自洽。
  const normalizedSteps = isStoreBought ? [] : steps;
  const normalizedIngredients = isStoreBought
    ? [
        {
          name: (name || '').trim(),
          amount: Number(ingredients[0]?.amount) || 1,
          unit: ingredients[0]?.unit || '份',
          category: ingredients[0]?.category || '其他',
          isOptional: false, // 买现成的就是要买的东西，不存在"可选"
        },
      ]
    : ingredients;

  let id = recipeId;
  if (id) {
    // 换图或者删图之后，原来那些文件就没人用了，顺手清掉，免得 uploads 越堆越大。
    // 步骤配图也一样：步骤是整批删掉重建的，得先把旧地址记下来。
    const before = await client.query('SELECT photo_url, thumb_url FROM recipes WHERE id=$1', [id]);
    const oldSteps = await client.query('SELECT photo_url, thumb_url FROM steps WHERE recipe_id=$1', [id]);
    const old = before.rows[0];

    await client.query(
      `UPDATE recipes SET name=$1, category=$2, meals=$3, time_minutes=$4, tags=$5,
              photo_url=$6, thumb_url=$7, servings=$8, is_store_bought=$9,
              health_score=$10, like_score=$11, updated_at=now()
       WHERE id=$12 AND family_id=$13`,
      [name, category, meals, timeMinutes, tags, photoURL, thumbURL, servings, isStoreBought,
       healthScore, likeScore, id, familyId]
    );

    const keptUrls = new Set(
      [
        photoURL,
        thumbURL,
        ...normalizedSteps.flatMap((s) => [sanitizePhotoURL(s.photoURL), sanitizePhotoURL(s.thumbURL)]),
      ].filter(Boolean)
    );
    // 快照同步刷新一遍：菜谱改名或改了健康分之后，
    // 万一以后菜谱被删，历史里兜底用的值也是最新的
    await client.query(
      'UPDATE menu_slots SET recipe_name=$1, health_score=$2 WHERE recipe_id=$3',
      [name, healthScore, id]
    );

    const stale = [
      old?.photo_url,
      old?.thumb_url,
      ...oldSteps.rows.flatMap((r) => [r.photo_url, r.thumb_url]),
    ].filter((url) => url && !keptUrls.has(url));
    if (stale.length) await deleteImageFiles(UPLOAD_DIR, stale);

    await client.query('DELETE FROM ingredients WHERE recipe_id=$1', [id]);
    await client.query('DELETE FROM steps WHERE recipe_id=$1', [id]);
  } else {
    const result = await client.query(
      `INSERT INTO recipes (family_id, name, category, meals, time_minutes, tags,
                            photo_url, thumb_url, servings, is_store_bought,
                            health_score, like_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [familyId, name, category, meals, timeMinutes, tags, photoURL, thumbURL, servings,
       isStoreBought, healthScore, likeScore]
    );
    id = result.rows[0].id;
  }

  for (let i = 0; i < normalizedIngredients.length; i++) {
    const ing = normalizedIngredients[i];
    await client.query(
      `INSERT INTO ingredients (recipe_id, name, amount, unit, category, is_optional, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, ing.name, Number(ing.amount) || 0, ing.unit || '', ing.category || '其他',
       ing.isOptional === true, i]
    );
  }
  for (let i = 0; i < normalizedSteps.length; i++) {
    const s = normalizedSteps[i];
    await client.query(
      `INSERT INTO steps (recipe_id, sort_order, title, content, timer_seconds, photo_url, thumb_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        i,
        s.title || '',
        s.content || '',
        Number(s.timerSeconds) || 0,
        sanitizePhotoURL(s.photoURL),
        sanitizePhotoURL(s.thumbURL),
      ]
    );
  }
  return id;
}

function groupBy(rows, key) {
  const map = {};
  rows.forEach((r) => {
    const k = r[key];
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  return map;
}

export function toRecipeJson(r, ingredients = [], steps = []) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    meals: r.meals || [],
    timeMinutes: r.time_minutes,
    servings: r.servings,
    isStoreBought: r.is_store_bought,
    healthScore: r.health_score,
    likeScore: r.like_score,                        // 默认喜好（菜谱级）
    mealLikeAvg: r.avg_like != null ? Number(r.avg_like) : null, // 实际吃过的均分
    mealLikeCount: r.rated_count ?? 0,
    tags: r.tags || [],
    lastCookedDate: r.last_cooked_date,
    photoURL: r.photo_url,
    thumbURL: r.thumb_url,
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      amount: Number(i.amount),
      unit: i.unit,
      category: i.category,
      isOptional: i.is_optional === true,
    })),
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      timerSeconds: s.timer_seconds,
      photoURL: s.photo_url,
      thumbURL: s.thumb_url,
    })),
  };
}

export default router;
