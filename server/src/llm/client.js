// 大模型调用。默认 Anthropic，也支持任何 OpenAI 兼容的接口（含本地 Ollama）。
//
// .env 里配：
//   LLM_API_KEY    必填，没配这个功能就自动隐藏
//   LLM_PROVIDER   anthropic（默认）| openai
//   LLM_MODEL      默认 claude-sonnet-5
//   LLM_BASE_URL   自建 / 兼容接口时用，例如 http://ollama:11434/v1
//
// 只有一个出口函数 callModel()，返回**已经解析好的 JSON 对象**。
// 模型可能返回带 ```json 围栏的文本，这里统一收拾掉。
const TIMEOUT_MS = 60000;

export function llmConfig() {
  const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  return {
    provider,
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || (provider === 'anthropic' ? 'claude-sonnet-5' : 'gpt-4o-mini'),
    baseUrl:
      process.env.LLM_BASE_URL ||
      (provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'),
  };
}

export function isLlmConfigured() {
  return Boolean(llmConfig().apiKey);
}

// 从模型返回的文本里挖出 JSON。它有时会加解释、有时会包 ``` 围栏。
export function extractJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // 退一步：取第一个 { 到最后一个 } 之间的内容
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('模型没有返回可解析的 JSON');
  }
}

async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      // 把模型服务的报错原样带出来一点，方便排查 key/额度问题，
      // 但不要把整个响应体倒给用户
      throw new Error(`模型服务返回 ${response.status}：${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('模型响应超时了，稍后再试');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// system + user -> JSON 对象。schema 只在 Anthropic 那边用来强制结构（tool use）。
export async function callModel({ system, user, schema, toolName = 'save_recipe', maxTokens = 4096 }) {
  const cfg = llmConfig();
  if (!cfg.apiKey) throw new Error('没有配置 LLM_API_KEY，这个功能用不了');

  if (cfg.provider === 'anthropic') {
    // 用 tool use 逼它按 schema 输出，比"请返回 JSON"稳得多
    const data = await postJson(
      `${cfg.baseUrl}/v1/messages`,
      { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: cfg.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [{ name: toolName, description: '把解析出来的菜谱交回来', input_schema: schema }],
        tool_choice: { type: 'tool', name: toolName },
      }
    );
    const toolUse = (data.content || []).find((c) => c.type === 'tool_use');
    if (!toolUse) {
      const text = (data.content || []).find((c) => c.type === 'text')?.text;
      return extractJson(text);
    }
    return toolUse.input;
  }

  // OpenAI 兼容（也涵盖 Ollama / vLLM / LM Studio 这些）
  const data = await postJson(
    `${cfg.baseUrl}/chat/completions`,
    { Authorization: `Bearer ${cfg.apiKey}` },
    {
      model: cfg.model,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\n\n只输出 JSON，结构如下：\n${JSON.stringify(schema)}` },
        { role: 'user', content: user },
      ],
    }
  );
  return extractJson(data.choices?.[0]?.message?.content);
}
