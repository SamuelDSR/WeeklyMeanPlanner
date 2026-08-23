import { useEffect, useState } from 'react';
import { Sparkles, Link2, ClipboardPaste, Loader2, ChevronDown } from 'lucide-react';
import { fetchImportStatus, importRecipeDraft } from '../lib/familyData';
import { useI18n } from '../i18n';

// 「用 AI 填一遍」：贴一段菜谱文字或者一个网址，让大模型把表单填好。
//
// 只做**预填**：解析结果直接进表单，用户改完再自己按保存。
// 后端没配 LLM_API_KEY 的话整个面板不显示 —— 没配就当没这功能。
export default function RecipeImportPanel({ onFill }) {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('text'); // text | url
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchImportStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus({ enabled: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleImport() {
    setError('');
    setBusy(true);
    try {
      const payload = mode === 'url' ? { url: url.trim() } : { text: text.trim() };
      const { recipe } = await importRecipeDraft(payload);
      onFill(recipe);
      setOpen(false);
      setText('');
      setUrl('');
    } catch (err) {
      setError(err.message || t('import.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!status?.enabled) return null;

  const canSubmit = !busy && (mode === 'url' ? url.trim().length > 0 : text.trim().length > 20);

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
          <p className="text-xs text-ink/50 leading-relaxed">{t('import.hint')}</p>

          <div className="flex rounded-lg overflow-hidden border border-mist">
            <button
              type="button"
              onClick={() => setMode('text')}
              className={`flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1 ${
                mode === 'text' ? 'bg-indigo text-porcelain' : 'bg-white text-ink/50'
              }`}
            >
              <ClipboardPaste size={13} /> {t('import.modeText')}
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`flex-1 py-1.5 text-xs font-medium flex items-center justify-center gap-1 ${
                mode === 'url' ? 'bg-indigo text-porcelain' : 'bg-white text-ink/50'
              }`}
            >
              <Link2 size={13} /> {t('import.modeUrl')}
            </button>
          </div>

          {mode === 'text' ? (
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
            onClick={handleImport}
            className="w-full py-2 rounded-lg bg-indigo text-porcelain text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? t('import.working') : t('import.action')}
          </button>

          <p className="text-[11px] text-ink/35 leading-relaxed">
            {t('import.reviewNote')}
            {status.model ? ` · ${status.model}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
