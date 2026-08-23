// 用大模型把一段文字 / 一个网址变成菜谱草稿，填进表单让用户过一遍再保存。
//
// 只做「预填」，从不直接落库 —— 模型会看错、会编，最后一定要人确认。
import { Router } from 'express';
import { requireAuth, requireFamily } from '../auth.js';
import { callModel, isLlmConfigured, llmConfig } from '../llm/client.js';
import { fetchPageText } from '../llm/fetchPage.js';
import { RECIPE_JSON_SCHEMA, SYSTEM_PROMPT, normalizeRecipeDraft } from '../llm/recipeSchema.js';

const router = Router();
router.use(requireAuth, requireFamily);

const MAX_TEXT_CHARS = 40000;
// 一次调用是要花钱的，简单挡一下连点和脚本刷
const COOLDOWN_MS = 3000;
const MAX_PER_HOUR = 40;
const recent = new Map(); // userId -> { last, windowStart, count }

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = recent.get(userId) || { last: 0, windowStart: now, count: 0 };

  if (now - entry.last < COOLDOWN_MS) {
    return '点太快了，等一两秒再试';
  }
  // 一小时的滑动窗口
  const windowStart = now - entry.windowStart > 3600_000 ? now : entry.windowStart;
  const count = windowStart === now ? 0 : entry.count;
  if (count >= MAX_PER_HOUR) {
    return `一小时内最多解析 ${MAX_PER_HOUR} 次，先歇会儿`;
  }

  recent.set(userId, { last: now, windowStart, count: count + 1 });
  return null;
}

// 这个功能有没有开（前端据此决定显不显示入口）
router.get('/status', (req, res) => {
  const cfg = llmConfig();
  res.json({
    enabled: isLlmConfigured(),
    provider: cfg.provider,
    model: isLlmConfigured() ? cfg.model : null,
  });
});

// POST /api/recipes/import  { text } 或 { url }
router.post('/', async (req, res) => {
  if (!isLlmConfigured()) {
    return res.status(503).json({
      error: '还没配置大模型。在 .env 里设好 LLM_API_KEY 再重启即可（详见 README）。',
    });
  }

  const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!rawText && !rawUrl) return res.status(400).json({ error: '把菜谱文字贴进来，或者给一个网址' });
  if (rawText.length > MAX_TEXT_CHARS) {
    return res.status(400).json({ error: '文字太长了，删掉一些无关内容再试' });
  }

  const limited = checkRateLimit(req.user.userId);
  if (limited) return res.status(429).json({ error: limited });

  let source = rawText;
  let sourceUrl = null;
  try {
    if (rawUrl) {
      const page = await fetchPageText(rawUrl);
      sourceUrl = page.finalUrl;
      source = page.text;
      if (!source || source.length < 40) {
        return res.status(400).json({
          error: '这个网页没抓到什么文字（可能需要登录或者是纯图片），试试直接把菜谱贴进来',
        });
      }
    }

    const draft = await callModel({
      system: SYSTEM_PROMPT,
      user: sourceUrl ? `来源网址：${sourceUrl}\n\n${source}` : source,
      schema: RECIPE_JSON_SCHEMA,
    });

    const recipe = normalizeRecipeDraft(draft);
    if (!recipe.name) {
      return res.status(422).json({ error: '这段内容里没认出菜谱，检查一下再试' });
    }
    // 来源网址塞进 tags，以后想回头看原文找得到
    if (sourceUrl && recipe.tags.length < 6) {
      try {
        recipe.tags = [...recipe.tags, new URL(sourceUrl).hostname.replace(/^www\./, '')];
      } catch {
        // 主机名取不出来就算了，不影响草稿本身
      }
    }
    res.json({ recipe, sourceUrl });
  } catch (err) {
    console.error('菜谱解析失败：', err);
    res.status(502).json({ error: err.message || '解析失败，稍后再试' });
  }
});

export default router;
