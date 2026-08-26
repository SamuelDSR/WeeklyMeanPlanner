import { useEffect, useState } from 'react';
import {
  Sparkles, Link2, ClipboardPaste, Loader2, ChevronDown, Braces, Copy, Check,
} from 'lucide-react';
import {
  fetchImportStatus,
  importRecipeDraft,
  fetchImportPrompt,
  importRecipeFromJson,
} from '../lib/familyData';
import { useI18n } from '../i18n';

// 「用 AI 填一遍」：三种方式，解析结果都只是**填进表单**，改完还是要自己按保存。
//
//   贴文字 / 给网址  —— 服务端直接调模型，需要配 LLM_API_KEY
//   贴 JSON         —— 自己拿提示词去问任何一个聊天窗口，把结果贴回来。
//                      不需要任何配置，也不花额外的钱（用你已有的订阅就行）。
//
// 所以整个面板永远显示，只是没配 key 时只剩「贴 JSON」这一种。
export default function RecipeImportPanel({ onFill }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('json'); // json | text | url
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchImportStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        // 配了 key 的话，默认停在更省事的「贴文字」上
        if (s.enabled) setMode('text');
      })
      .catch(() => {
        // status 拿不到就只当没配 key：贴 JSON 这条路本来也不依赖服务端配置
        if (!cancelled) setStatus({ enabled: false, pasteEnabled: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 提示词按需取一次
  useEffect(() => {
    if (mode !== 'json' || prompt || !open) return;
    let cancelled = false;
    fetchImportPrompt()
      .then((p) => {
        if (!cancelled) setPrompt(p);
      })
      .catch(() => {
        // 取不到就把复制按钮藏起来，粘贴功能本身还能用
      });
    return () => {
      cancelled = true;
    };
  }, [mode, prompt, open]);

  // 复制提示词。navigator.clipboard 只在安全上下文（https / localhost）里有，
  // 从局域网 IP 用明文 http 打开时它是 undefined —— 所以要有退路。
  async function copyPrompt() {
    setError('');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const box = document.getElementById('import-prompt-box');
        if (!box) throw new Error('no fallback');
        box.hidden = false;
        box.select();
        // execCommand 已经废弃，但明文 http 下它是唯一还能用的
        if (!document.execCommand?.('copy')) throw new Error('execCommand failed');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制不了就把提示词摊开，让用户自己全选复制
      const box = document.getElementById('import-prompt-box');
      if (box) box.hidden = false;
      setError(t('import.copyManual'));
    }
  }

  async function handleSubmit() {
    setError('');
    setBusy(true);
    try {
      const { recipe } =
        mode === 'json'
          ? await importRecipeFromJson(json.trim())
          : await importRecipeDraft(mode === 'url' ? { url: url.trim() } : { text: text.trim() });
      onFill(recipe);
      setOpen(false);
      setText('');
      setUrl('');
      setJson('');
    } catch (err) {
      setError(err.message || t('import.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  const canSubmit =
    !busy &&
    (mode === 'url'
      ? url.trim().length > 0
      : mode === 'json'
        ? json.trim().length > 10
        : text.trim().length > 20);

  const MODES = [
    { key: 'json', icon: Braces, label: t('import.modeJson'), always: true },
    { key: 'text', icon: ClipboardPaste, label: t('import.modeText') },
    { key: 'url', icon: Link2, label: t('import.modeUrl') },
  ].filter((m) => m.always || status.enabled);

  return (
    <div className="border border-indigo/25 bg-indigo/[0.03] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <Sparkles size={15} className="text-indigo shrink-0" />
        <span className="text-sm font-medium text-indigo flex-1">{t('import.title')}</span>
        <ChevronDown
          size={16}
          className={`text-indigo/50 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-ink/50 leading-relaxed">
            {status.enabled ? t('import.hint') : t('import.hintNoKey')}
          </p>

          {MODES.length > 1 && (
            <div className="flex rounded-lg overflow-hidden border border-mist">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1 ${
                    mode === m.key ? 'bg-indigo text-porcelain' : 'bg-white text-ink/50'
                  }`}
                >
                  <m.icon size={13} /> {m.label}
                </button>
              ))}
            </div>
          )}

          {mode === 'json' ? (
            <>
              {/* 三步：复制提示词 -> 去任何聊天窗口问 -> 把 JSON 贴回来 */}
              <ol className="text-[11px] text-ink/50 leading-relaxed list-decimal pl-4 space-y-0.5">
                <li>{t('import.jsonStep1')}</li>
                <li>{t('import.jsonStep2')}</li>
                <li>{t('import.jsonStep3')}</li>
              </ol>
              {prompt && (
                <>
                  <button
                    type="button"
                    onClick={copyPrompt}
                    className="w-full py-1.5 rounded-md border border-indigo/40 text-indigo text-xs font-medium flex items-center justify-center gap-1"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? t('import.copied') : t('import.copyPrompt')}
                  </button>
                  {/* 复制不了（明文 http 下没有 clipboard API）时摊开让用户手动全选 */}
                  <textarea
                    id="import-prompt-box"
                    hidden
                    readOnly
                    value={prompt}
                    rows={5}
                    className="w-full px-2 py-2 rounded-md border border-mist bg-white text-[11px] font-mono outline-none"
                  />
                </>
              )}
              <textarea
                value={json}
                onChange={(e) => setJson(e.target.value)}
                rows={6}
                placeholder={t('import.jsonPlaceholder')}
                className="w-full px-2 py-2 rounded-md border border-mist bg-white text-sm font-mono outline-none resize-y"
              />
            </>
          ) : mode === 'text' ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={t('import.textPlaceholder')}
              className="w-full px-2 py-2 rounded-md border border-mist bg-white text-sm outline-none resize-y"
            />
          ) : (
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-2 py-2 rounded-md border border-mist bg-white text-sm outline-none"
            />
          )}

          {error && <p className="text-persimmon text-xs">{error}</p>}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full py-2 rounded-lg bg-indigo text-porcelain text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? t('import.working') : t('import.action')}
          </button>

          <p className="text-[11px] text-ink/35 leading-relaxed">
            {t('import.reviewNote')}
            {mode !== 'json' && status.model ? ` · ${status.model}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
