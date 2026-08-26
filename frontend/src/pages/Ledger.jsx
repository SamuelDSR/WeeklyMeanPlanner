import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, Plus, ChevronLeft, ChevronRight, FolderPlus, Trash2, Archive,
  ArchiveRestore, Pencil, X,
} from 'lucide-react';
import {
  fetchLedgerMeta, fetchLedgerOverview, fetchExpenses,
  createLedger, updateLedger, deleteLedger,
  createExpense, updateExpense, deleteExpense,
} from '../lib/ledgerData';
import { fetchFamily } from '../lib/familyAdmin';
import { formatMoney, formatTotals, currentMonth, shiftMonth } from '../lib/formatMoney';
import ExpenseForm from '../components/ExpenseForm';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 记账。
//
// 主账本就是这个家庭 —— 没有单独的「主账本」实体。子账本（度假、装修）是
// 主账本里带名字的一撮开销：既能单独看「这次度假花了多少」，
// 也仍然算进「这个月一共花了多少」。
const today = () => new Date().toISOString().slice(0, 10);

const emptyExpense = (currency, ledgerId) => ({
  amount: '', currency, spentOn: today(), category: '餐饮',
  ledgerId: ledgerId ?? 'daily', note: '', paidBy: null,
});

export default function Ledger() {
  const { t, locale } = useI18n();
  const [meta, setMeta] = useState({ categories: [], currencies: [], familyCurrency: 'EUR' });
  const [overview, setOverview] = useState(null);
  const [month, setMonth] = useState(currentMonth);
  // 当前在看哪个账本：'all'（总账）| 'daily'（日常）| 子账本 id
  const [scope, setScope] = useState('all');
  const [expenses, setExpenses] = useState([]);
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState(null);
  const [ledgerDraft, setLedgerDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    const [ov, ex] = await Promise.all([
      fetchLedgerOverview(month),
      fetchExpenses({
        month,
        ledger: scope === 'all' ? undefined : scope,
        limit: 200,
      }),
    ]);
    setOverview(ov);
    setExpenses(ex.expenses);
  }, [month, scope]);

  useEffect(() => {
    fetchLedgerMeta().then(setMeta).catch(() => {});
    fetchFamily().then((d) => setMembers(d.members || [])).catch(() => {});
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message || t('common.loadFailed')));
  }, [load]);

  async function run(fn) {
    setError('');
    setBusy(true);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(e.message || t('common.saveFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveExpense() {
    const ok = await run(async () => {
      const { id, ...data } = draft;
      if (id) await updateExpense(id, data);
      else await createExpense(data);
    });
    if (ok) setDraft(null);
  }

  async function saveLedger() {
    const ok = await run(async () => {
      const { id, ...data } = ledgerDraft;
      if (id) await updateLedger(id, data);
      else await createLedger(data);
    });
    if (ok) setLedgerDraft(null);
  }

  const ledgers = overview?.ledgers ?? [];
  const byLedger = overview?.byLedger ?? {};
  const visibleLedgers = ledgers.filter((l) => (showArchived ? true : !l.archivedAt));

  // 当前视角下的合计
  const scopeTotals = useMemo(() => {
    if (!overview) return [];
    if (scope === 'all') return overview.totals;
    const bucket = byLedger[scope === 'daily' ? 'daily' : String(scope)];
    // 子账本卡片上的数是「全部历史」，但这里跟着月份筛选走，所以用当月的明细算
    return bucket && month === null ? bucket.totals : sumFromExpenses(expenses);
  }, [overview, scope, byLedger, expenses, month]);

  const scopeName =
    scope === 'all' ? t('ledger.allLedgers')
    : scope === 'daily' ? t('ledger.daily')
    : ledgers.find((l) => String(l.id) === String(scope))?.name ?? '';

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <Wallet size={19} className="text-indigo" /> {t('ledger.title')}
        </h2>
        <button
          onClick={() => setDraft(emptyExpense(meta.familyCurrency, scope === 'all' ? 'daily' : scope))}
          className="text-sm text-indigo flex items-center gap-1 px-2 py-1.5 -mr-2"
        >
          <Plus size={16} /> {t('ledger.add')}
        </button>
      </div>

      {/* 月份切换 */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-card px-2 py-2 mb-3">
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="p-2 text-ink/50">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-mono text-sm">{month}</p>
          <p className="font-display font-bold text-lg text-indigo">
            {formatTotals(scopeTotals, locale)}
          </p>
          <p className="text-[11px] text-ink/40">{scopeName}</p>
        </div>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonth()}
          className="p-2 text-ink/50 disabled:opacity-25"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {error && <p className="text-persimmon text-sm mb-3">{error}</p>}

      {draft && (
        <div className="mb-3">
          <ExpenseForm
            draft={draft}
            meta={meta}
            ledgers={ledgers}
            members={members}
            onChange={setDraft}
            onSubmit={saveExpense}
            onCancel={() => setDraft(null)}
            busy={busy}
            error={null}
          />
        </div>
      )}

      {/* 账本切换：总账 / 日常 / 各个子账本 */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-4 px-4">
        {[
          { key: 'all', label: t('ledger.allLedgers') },
          { key: 'daily', label: t('ledger.daily') },
          ...visibleLedgers.map((l) => ({ key: String(l.id), label: l.name, archived: !!l.archivedAt })),
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setScope(tab.key === 'all' ? 'all' : tab.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${
              String(scope) === tab.key
                ? 'bg-indigo text-porcelain border-indigo'
                : 'border-mist text-ink/55 bg-white'
            } ${tab.archived ? 'opacity-50' : ''}`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => setLedgerDraft({ name: '', note: '', startsOn: '', endsOn: '', currency: '' })}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-indigo/50 text-indigo flex items-center gap-1"
        >
          <FolderPlus size={13} /> {t('ledger.newLedger')}
        </button>
      </div>

      {/* 子账本一览：每个显示它**全部历史**的合计 —— 「这次度假一共花了多少」 */}
      {scope === 'all' && visibleLedgers.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink/50">{t('ledger.subLedgers')}</p>
            {ledgers.some((l) => l.archivedAt) && (
              <button onClick={() => setShowArchived((v) => !v)} className="text-[11px] text-indigo">
                {showArchived ? t('ledger.hideArchived') : t('ledger.showArchived')}
              </button>
            )}
          </div>
          {visibleLedgers.map((l) => {
            const bucket = byLedger[String(l.id)];
            return (
              <div key={l.id} className="bg-white rounded-xl shadow-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => setScope(String(l.id))} className="text-left min-w-0 flex-1">
                    <p className={`font-medium text-sm truncate ${l.archivedAt ? 'text-ink/40' : ''}`}>
                      {l.name}
                      {l.archivedAt && (
                        <span className="ml-1.5 text-[10px] text-ink/35">{t('ledger.archived')}</span>
                      )}
                    </p>
                    {(l.startsOn || l.endsOn) && (
                      <p className="text-[11px] text-ink/40 font-mono">
                        {l.startsOn || '…'} → {l.endsOn || '…'}
                      </p>
                    )}
                    {l.note && <p className="text-[11px] text-ink/40 truncate">{l.note}</p>}
                  </button>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-sm text-indigo">
                      {formatTotals(bucket?.totals, locale)}
                    </p>
                    <p className="text-[10px] text-ink/35">
                      {t('ledger.entryCount', { count: bucket?.count ?? 0 })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 mt-2 pt-2 border-t border-mist">
                  <button
                    onClick={() => setLedgerDraft({
                      id: l.id, name: l.name, note: l.note,
                      startsOn: l.startsOn ?? '', endsOn: l.endsOn ?? '', currency: l.currency ?? '',
                    })}
                    className="flex-1 py-1.5 text-ink/40 flex justify-center"
                    aria-label={t('common.edit')}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => run(() => updateLedger(l.id, { archived: !l.archivedAt }))}
                    className="flex-1 py-1.5 text-ink/40 flex justify-center border-l border-mist"
                    aria-label={l.archivedAt ? t('ledger.unarchive') : t('ledger.archive')}
                  >
                    {l.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(t('ledger.deleteLedgerConfirm', { name: l.name }))) {
                        run(() => deleteLedger(l.id));
                      }
                    }}
                    className="flex-1 py-1.5 text-ink/40 flex justify-center border-l border-mist"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 按分类 */}
      {scope === 'all' && overview?.byCategory && Object.keys(overview.byCategory).length > 0 && (
        <div className="bg-white rounded-xl shadow-card p-3 mb-4">
          <p className="text-xs text-ink/50 mb-2">{t('ledger.byCategory')}</p>
          <ul className="space-y-1">
            {Object.entries(overview.byCategory)
              .sort((a, b) => (b[1].totals[0]?.total ?? 0) - (a[1].totals[0]?.total ?? 0))
              .map(([cat, v]) => (
                <li key={cat} className="flex items-baseline justify-between text-sm">
                  <span className="text-ink/70">{domainLabel(locale, 'expenseCategory', cat)}</span>
                  <span className="font-mono text-ink/60 text-xs">{formatTotals(v.totals, locale)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* 明细 */}
      <p className="text-xs text-ink/50 mb-2">{t('ledger.entries')}</p>
      {expenses.length === 0 ? (
        <p className="text-center text-ink/35 text-sm py-6">{t('ledger.noEntries')}</p>
      ) : (
        <ul className="bg-white rounded-xl shadow-card divide-y divide-mist">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-start gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  {e.note || domainLabel(locale, 'expenseCategory', e.category)}
                </p>
                <p className="text-[11px] text-ink/40 font-mono">
                  {e.spentOn} · {domainLabel(locale, 'expenseCategory', e.category)}
                  {e.ledgerName ? ` · ${e.ledgerName}` : ''}
                  {e.paidByName ? ` · ${e.paidByName}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-sm">{formatMoney(e.amount, e.currency, locale)}</p>
                <div className="flex gap-1 justify-end mt-0.5">
                  <button
                    onClick={() => setDraft({
                      id: e.id, amount: String(e.amount), currency: e.currency,
                      spentOn: e.spentOn, category: e.category,
                      ledgerId: e.ledgerId ?? 'daily', note: e.note, paidBy: e.paidBy,
                    })}
                    className="text-ink/30 p-1"
                    aria-label={t('common.edit')}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(t('ledger.deleteExpenseConfirm'))) {
                        run(() => deleteExpense(e.id));
                      }
                    }}
                    className="text-ink/30 p-1"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 新建 / 编辑子账本 */}
      {ledgerDraft && (
        <div className="fixed inset-0 z-40 bg-ink/40 flex items-end sm:items-center justify-center">
          <div className="bg-porcelain w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl pb-safe">
            <div className="flex items-center justify-between px-4 py-3 border-b border-mist">
              <h3 className="font-display font-semibold">
                {ledgerDraft.id ? t('ledger.editLedger') : t('ledger.newLedger')}
              </h3>
              <button onClick={() => setLedgerDraft(null)} className="p-1.5 text-ink/40">
                <X size={20} />
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <p className="text-xs text-ink/45 leading-relaxed">{t('ledger.ledgerIntro')}</p>
              <div>
                <label className="text-xs text-ink/50 block mb-1">{t('ledger.ledgerName')}</label>
                <input
                  autoFocus
                  value={ledgerDraft.name}
                  onChange={(e) => setLedgerDraft({ ...ledgerDraft, name: e.target.value })}
                  placeholder={t('ledger.ledgerNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-mist outline-none"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-ink/50 block mb-1">{t('ledger.startsOn')}</label>
                  <input
                    type="date"
                    value={ledgerDraft.startsOn}
                    onChange={(e) => setLedgerDraft({ ...ledgerDraft, startsOn: e.target.value })}
                    className="w-full px-2 py-2 rounded-lg border border-mist outline-none text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-ink/50 block mb-1">{t('ledger.endsOn')}</label>
                  <input
                    type="date"
                    value={ledgerDraft.endsOn}
                    onChange={(e) => setLedgerDraft({ ...ledgerDraft, endsOn: e.target.value })}
                    className="w-full px-2 py-2 rounded-lg border border-mist outline-none text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-ink/50 block mb-1">{t('ledger.note')}</label>
                <input
                  value={ledgerDraft.note}
                  onChange={(e) => setLedgerDraft({ ...ledgerDraft, note: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-mist outline-none text-sm"
                />
              </div>
              {error && <p className="text-persimmon text-sm">{error}</p>}
              <button
                onClick={saveLedger}
                disabled={busy || !ledgerDraft.name.trim()}
                className="w-full py-2.5 rounded-lg bg-indigo text-porcelain font-medium disabled:opacity-40"
              >
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 明细列表里的合计（按货币分开，绝不相加）
function sumFromExpenses(list) {
  const map = new Map();
  (list || []).forEach((e) => {
    const prev = map.get(e.currency) || 0;
    map.set(e.currency, prev + Number(e.amount));
  });
  return Array.from(map.entries())
    .map(([currency, total]) => ({ currency, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.currency.localeCompare(b.currency));
}
