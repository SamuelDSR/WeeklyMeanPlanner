import { useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 记一笔。金额支持 12.50 和 12,50 两种写法（法语键盘打出来是逗号）。
export default function ExpenseForm({ draft, meta, ledgers, members, onChange, onSubmit, onCancel, busy, error }) {
  const { t, locale } = useI18n();
  const [showMore, setShowMore] = useState(false);

  const set = (patch) => onChange({ ...draft, ...patch });

  return (
    <div className="bg-white rounded-xl shadow-card p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm">
          {draft.id ? t('ledger.editExpense') : t('ledger.newExpense')}
        </h3>
        <button onClick={onCancel} className="p-1 text-ink/40" aria-label={t('common.cancel')}>
          <X size={18} />
        </button>
      </div>

      {/* 金额和日期是必填，放最上面，记账要快 */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-ink/50 block mb-1">{t('ledger.amount')}</label>
          <input
            autoFocus
            // 用 text 而不是 number：number 在部分浏览器上不接受逗号小数
            type="text"
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => set({ amount: e.target.value })}
            placeholder="12,50"
            className="w-full px-3 py-2 rounded-lg border border-mist text-lg font-mono outline-none"
          />
        </div>
        <div className="w-24">
          <label className="text-xs text-ink/50 block mb-1">{t('ledger.currency')}</label>
          <select
            value={draft.currency}
            onChange={(e) => set({ currency: e.target.value })}
            className="w-full px-2 py-2 rounded-lg border border-mist bg-white outline-none text-sm"
          >
            {(meta.currencies || []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-ink/50 block mb-1">{t('ledger.date')}</label>
          <input
            type="date"
            value={draft.spentOn}
            onChange={(e) => set({ spentOn: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-mist outline-none text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-ink/50 block mb-1">{t('ledger.category')}</label>
          <select
            value={draft.category}
            onChange={(e) => set({ category: e.target.value })}
            className="w-full px-2 py-2 rounded-lg border border-mist bg-white outline-none text-sm"
          >
            {(meta.categories || []).map((c) => (
              <option key={c} value={c}>{domainLabel(locale, 'expenseCategory', c)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 记到哪个账本 —— 这是子账本功能的入口 */}
      <div>
        <label className="text-xs text-ink/50 block mb-1">{t('ledger.intoLedger')}</label>
        <select
          value={draft.ledgerId ?? 'daily'}
          onChange={(e) => set({ ledgerId: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none text-sm"
        >
          <option value="daily">{t('ledger.daily')}</option>
          {ledgers.filter((l) => !l.archivedAt).map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-ink/50 block mb-1">{t('ledger.note')}</label>
        <input
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder={t('ledger.notePlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-mist outline-none text-sm"
        />
      </div>

      {showMore ? (
        <div>
          <label className="text-xs text-ink/50 block mb-1">{t('ledger.paidBy')}</label>
          <select
            value={draft.paidBy ?? ''}
            onChange={(e) => set({ paidBy: e.target.value || null })}
            className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none text-sm"
          >
            <option value="">{t('ledger.paidByMe')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))}
          </select>
        </div>
      ) : (
        <button onClick={() => setShowMore(true)} className="text-xs text-indigo">
          {t('ledger.more')}
        </button>
      )}

      {error && <p className="text-persimmon text-sm">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={busy || !draft.amount.trim()}
        className="w-full py-2.5 rounded-lg bg-indigo text-porcelain font-medium disabled:opacity-40"
      >
        {busy ? t('common.saving') : t('common.save')}
      </button>
    </div>
  );
}
