// 用大模型把一段文字 / 一个网址变成菜谱草稿，填进表单让用户过一遍再保存。
//
// 只做「预填」，从不直接落库 —— 模型会看错、会编，最后一定要人确认。
import { Router } from 'express';
import { requireAuth, requireFamily } from '../auth.js';
import { callModel, isLlmConfigured, llmConfig } from '../llm/client.js';
import { fetchPageText } from '../llm/fetchPage.js';
import {
  RECIPE_JSON_SCHEMA,
  SYSTEM_PROMPT,
  normalizeRecipeDraft,
  buildPastePrompt,
} from '../llm/recipeSchema.js';
import { extractJson } from '../llm/client.js';

const router = Router();
router.use(requireAuth, requireFamily);

const MAX_TEXT_CHARS = 40000;
// 贴 JSON 不花钱，但也不能让人往内存里灌任意大的字符串
const MAX_PASTE_CHARS = 200000;
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
    // 服务端直接调模型的那两种方式（贴文字 / 给网址）要配 key 才有
    enabled: isLlmConfigured(),
    provider: cfg.provider,
    model: isLlmConfigured() ? cfg.model : null,
    // 「自己去问，把 JSON 贴回来」不需要任何配置，永远能用
    pasteEnabled: true,
  });
});

// 提示词：让用户拿去粘到任何一个聊天窗口里（Claude.ai / ChatGPT / 本地模型都行）。
// 放在服务端而不是前端写死，是为了和真正调模型时用的是同一份 schema —— 
// 两边分开维护的话，用户贴回来的 JSON 迟早和我们期望的形状对不上。
router.get('/prompt', (req, res) => {
  res.json({ prompt: buildPastePrompt() });
});

// POST /api/recipes/import/paste  { json: "<粘贴进来的内容>" }
//
// 不需要配置任何 key：用户已经在别处（自己的订阅、本地模型）拿到了结果，
// 这里只负责把它清洗成表单能用的草稿。
// 清洗走的是和调模型完全同一条路径 normalizeRecipeDraft()，
// 所以「不信模型输出」这条规矩对粘贴进来的内容一样成立。
router.post('/paste', async (req, res) => {
  const raw = typeof req.body?.json === 'string' ? req.body.json : null;
  const asObject = !raw && req.body?.json && typeof req.body.json === 'object' ? req.body.json : null;

  if (!raw && !asObject) {
    return res.status(400).json({ error: '把模型返回的 JSON 贴进来' });
  }
  if (raw && raw.length > MAX_PASTE_CHARS) {
    return res.status(400).json({ error: '内容太长了，只贴 JSON 那一段就行' });
  }

  let parsed;
  try {
    // extractJson 会处理带 ``` 围栏、前后还带着解释文字的情况 ——
    // 聊天窗口里复制出来的基本都是这样
    parsed = asObject || extractJson(raw);
  } catch {
    return res.status(400).json({
      error: '这段内容解析不出 JSON。确认复制的是 { 开头、} 结尾的那一段。',
    });
  }

  const recipe = normalizeRecipeDraft(parsed);
  if (!recipe.name) {
    return res.status(422).json({ error: 'JSON 里没有菜名（name 字段），检查一下再贴' });
  }
  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
    return res.status(422).json({ error: 'JSON 里既没有食材也没有步骤，可能贴错了' });
  }
  res.json({ recipe });
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
