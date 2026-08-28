import { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n';

// 邀请码：家人拿这个码就能加入这个家庭（在登录页选「加入已有家庭」）
export default function InviteCodeCard({ code, canManage, onRegenerate }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 浏览器不给权限（比如非 https 又不是本机）时，提示手动选中复制
      setCopyFailed(true);
    }
  }

  async function regenerate() {
    if (!window.confirm(t('family.regenerateConfirm'))) return;
    setBusy(true);
    try {
      await onRegenerate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-3.5">
      <h4 className="text-sm font-medium text-ink/60 mb-2">{t('family.inviteTitle')}</h4>

      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-2xl tracking-[0.2em] text-indigo bg-porcelain rounded-lg px-3 py-2 text-center select-all">
          {code}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 p-2.5 rounded-lg border border-mist text-ink/60 hover:text-indigo"
          aria-label={t('family.copyInvite')}
        >
          {copied ? <Check size={18} className="text-indigo" /> : <Copy size={18} />}
        </button>
      </div>

      <p className="text-xs text-ink/40 mt-2 leading-relaxed">
        {t('family.inviteHint')}
      </p>
      {copyFailed && (
        <p className="text-xs text-persimmon mt-1">{t('family.copyFailed')}</p>
      )}

      {canManage && (
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="mt-2.5 text-xs text-ink/50 hover:text-persimmon flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw size={12} /> {busy ? t('family.regenerating') : t('family.regenerate')}
        </button>
      )}
    </div>
  );
}
