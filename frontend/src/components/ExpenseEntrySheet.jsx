import { useMemo, useState } from 'react';
import { X, Tag } from 'lucide-react';
import CategoryIcon from './CategoryIcon';
import Numpad from './Numpad';
import { evaluateExpression, hasOperator, pressKey } from '../lib/expenseCalc';
import { formatMoney } from '../lib/formatMoney';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 记一笔的全屏面板。
//
// 顺序照着「人怎么想」来排：先选是收还是支 -> 点一下分类 -> 敲金额 -> 完成。
// 金额支持 21+35 这种直接加（早餐+午餐），省得先开计算器。
//
// 分类做成图标网格而不是下拉框：十几个分类用下拉要滚要找，
// 图标一眼扫过去就点中了 —— 记账这事一慢就不会坚持记。
export default function ExpenseEntrySheet({
  draft, meta, ledgers, members, onChange, onSubmit, onClose, busy, error,
}) {
  const { t, locale } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  const kind = draft.kind || 'expense';
  const categories = meta.categories?.[kind] ?? [];
  const set = (patch) => onChange({ ...draft, ...patch });

  const value = useMemo(() => evaluateExpression(draft.amount), [draft.amount]);
  const showResult = hasOperator(draft.amount) && value !== null;
  const canSubmit = !busy && value !== null && value > 0;

  // 换收/支时分类要跟着换：'工资' 挂在支出下面是不合法的
  function switchKind(next) {
    if (next === kind) return;
    const list = meta.categories?.[next] ?? [];
    const stillOk = list.some((c) => c.value === draft.category);
    set({ kind: next, category: stillOk ? draft.category : list[0]?.value });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateLabel = draft.spentOn === todayStr ? t('ledger.today') : draft.spentOn.slice(5);

  return (
    <div className="fixed inset-0 z-50 bg-porcelain flex flex-col">
      {/* 支出 / 收入 / 取消 */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-mist bg-white pt-safe">
        <div className="flex gap-1">
          {['expense', 'income'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => switchKind(k)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg ${
                kind === k ? 'text-indigo border-b-2 border-indigo rounded-none' : 'text-ink/40'
              }`}
            >
              {t(k === 'expense' ? 'ledger.kindExpense' : 'ledger.kindIncome')}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="p-2.5 text-ink/50" aria-label={t('common.cancel')}>
          <X size={20} />
        </button>
      </div>

      {/* 分类网格：一行四个，和参考的记账 App 一样 */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="grid grid-cols-4 gap-y-3">
          {categories.map((c) => {
            const active = draft.category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => set({ category: c.value })}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    active ? 'bg-indigo text-porcelain' : 'bg-mist/70 text-ink/55'
                  }`}
                >
                  <CategoryIcon name={c.icon} size={20} />
                </span>
                <span className={`text-[11px] ${active ? 'text-indigo font-medium' : 'text-ink/50'}`}>
                  {domainLabel(locale, 'expenseCategory', c.value)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 金额：表达式在左，算出来的结果在右 */}
      <div className="bg-white border-t border-mist px-3 py-2 shrink-0">
        <div className="flex items-baseline justify-end gap-2 min-h-[2.2rem]">
          {showResult && (
            <span className="text-sm text-ink/35 font-mono">
              = {formatMoney(value, draft.currency, locale)}
            </span>
          )}
          <span className="text-3xl font-mono text-ink tabular-nums">
            {draft.amount || '0'}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <input
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder={t('ledger.notePlaceholder')}
            className="flex-1 min-w-0 px-2 py-2 rounded-md bg-mist/40 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className={`p-2 rounded-md ${showDetails ? 'text-indigo bg-indigo/10' : 'text-ink/35'}`}
            aria-label={t('ledger.more')}
          >
            <Tag size={17} />
          </button>
        </div>

        {/* 子账本 / 货币 / 付款人 —— 不是每次都要改，收起来 */}
        {showDetails && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <select
              value={draft.ledgerId ?? 'daily'}
              onChange={(e) => set({ ledgerId: e.target.value })}
              className="px-2 py-1.5 rounded-md border border-mist bg-white text-xs outline-none"
            >
              <option value="daily">{t('ledger.daily')}</option>
              {ledgers.filter((l) => !l.archivedAt).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select
              value={draft.currency}
              onChange={(e) => set({ currency: e.target.value })}
              className="px-2 py-1.5 rounded-md border border-mist bg-white text-xs font-mono outline-none"
            >
              {(meta.currencies || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={draft.paidBy ?? ''}
              onChange={(e) => set({ paidBy: e.target.value || null })}
              className="px-2 py-1.5 rounded-md border border-mist bg-white text-xs outline-none"
            >
              <option value="">{t('ledger.paidByMe')}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </select>
          </div>
        )}

        {error && <p className="text-persimmon text-xs mt-1.5">{error}</p>}
      </div>

      {/* 日期用原生控件，藏在键盘的「今天」键后面 */}
      <input
        id="entry-date"
        type="date"
        value={draft.spentOn}
        onChange={(e) => e.target.value && set({ spentOn: e.target.value })}
        className="sr-only"
      />

      <div className="shrink-0 pb-safe">
        <Numpad
          onKey={(k) => set({ amount: pressKey(draft.amount, k) })}
          onDone={() => onSubmit(value)}
          onPickDate={() => {
            const el = document.getElementById('entry-date');
            // showPicker 是新 API，老浏览器退回普通点击
            if (el?.showPicker) el.showPicker();
            else el?.click();
          }}
          dateLabel={dateLabel}
          canSubmit={canSubmit}
        />
      </div>
    </div>
  );
}
