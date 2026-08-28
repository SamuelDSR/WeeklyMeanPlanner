import { useCallback, useEffect, useState } from 'react';
import {
  Wallet, Plus, ChevronLeft, ChevronRight, FolderPlus, Trash2, Archive,
  ArchiveRestore, Pencil, X, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import {
  fetchLedgerMeta, fetchLedgerOverview, fetchExpenses,
  createLedger, updateLedger, deleteLedger,
  createExpense, updateExpense, deleteExpense,
} from '../lib/ledgerData';
import { fetchFamily } from '../lib/familyAdmin';
import { enqueue, flushQueue } from '../lib/syncQueue';
import { isNetworkError } from '../lib/localCache';
import {
  formatMoney, formatTotals, currentMonth, shiftPeriod, isFuturePeriod, toGranularity,
} from '../lib/formatMoney';
import ExpenseEntrySheet from '../components/ExpenseEntrySheet';
import CategoryBreakdown from '../components/CategoryBreakdown';
import CategoryIcon from '../components/CategoryIcon';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 记账。
//
// 主账本就是这个家庭 —— 没有单独的「主账本」实体。子账本（度假、装修）是
// 主账本里带名字的一撮开销：既能单独看，也仍然算进总账。
const today = () => new Date().toISOString().slice(0, 10);

const emptyEntry = (currency, ledgerId, kind = 'expense') => ({
  kind,
  amount: '',
  currency,
  spentOn: today(),
  category: kind === 'income' ? '工资' : '餐饮',
  ledgerId: ledgerId ?? 'daily',
  note: '',
  paidBy: null,
});

export default function Ledger() {
  const { t, locale } = useI18n();
  const [meta, setMeta] = useState({ categories: { expense: [], income: [] }, currencies: [], familyCurrency: 'EUR' });
  const [overview, setOverview] = useState(null);
  const [period, setPeriod] = useState(currentMonth);
  const [granularity, setGranularity] = useState('month'); // month | year
  const [scope, setScope] = useState('all'); // all | daily | 子账本 id
  const [expenses, setExpenses] = useState([]);
  const [members, setMembers] = useState([]);
  const [entry, setEntry] = useState(null);
  const [ledgerDraft, setLedgerDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entryError, setEntryError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState('expense'); // 分类榜看支出还是收入

  const load = useCallback(async () => {
    const [ov, ex] = await Promise.all([
      fetchLedgerOverview(period),
      fetchExpenses({ period, ledger: scope === 'all' ? undefined : scope, limit: 300 }),
    ]);
    setOverview(ov);
    setExpenses(ex.expenses);
  }, [period, scope]);

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

  // 键盘上的「完成」把算好的数字传上来（21+35 -> 56）
  async function saveEntry(value) {
    setEntryError('');
    setBusy(true);
    const { id, ...rest } = entry;
    const data = { ...rest, amount: String(value) };
    try {
      if (id) await updateExpense(id, data);
      else await createExpense(data);
      await load();
      setEntry(null);
    } catch (e) {
      // 断网时**新记的一笔**存进队列，联网自动补发 —— 在外面花的钱最该当场记下来。
      // 「改一笔」不排队：那是修改，家里人可能同时也在改同一条，
      // 离线补发会无声地盖掉别人的改动（详见 lib/syncQueue.js）。
      if (!id && isNetworkError(e)) {
        enqueue('expense.create', data);
        setEntry(null);
        setError(t('offline.queuedExpense'));
      } else {
        setEntryError(
          isNetworkError(e) ? t('offline.needOnlineEdit') : e.message || t('common.saveFailed')
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveLedger() {
    const ok = await run(async () => {
      const { id, ...data } = ledgerDraft;
      if (id) await updateLedger(id, data);
      else await createLedger(data);
    });
    if (ok) setLedgerDraft(null);
  }

  function switchGranularity(g) {
    setGranularity(g);
    setPeriod((p) => toGranularity(p, g));
  }

  const ledgers = overview?.ledgers ?? [];
  const byLedger = overview?.byLedger ?? {};
  const byLedgerKinds = overview?.byLedgerKinds ?? {};
  const visibleLedgers = ledgers.filter((l) => (showArchived ? true : !l.archivedAt));
  const totals = overview?.totals ?? { expense: [], income: [], net: [] };

  // 明细列表跟着当前账本视角走
  const scoped = scope === 'all' ? expenses : expenses;

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
          onClick={() => {
            setEntryError('');
            setEntry(emptyEntry(meta.familyCurrency, scope === 'all' ? 'daily' : scope));
          }}
          className="text-sm text-indigo flex items-center gap-1 px-2 py-1.5 -mr-2"
        >
          <Plus size={16} /> {t('ledger.add')}
        </button>
      </div>

      {/* 月 / 年 切换 */}
      <div className="flex gap-1 mb-2 bg-mist/60 rounded-lg p-1">
        {['month', 'year'].map((g) => (
          <button
            key={g}
            onClick={() => switchGranularity(g)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium ${
              granularity === g ? 'bg-white text-indigo shadow-sm' : 'text-ink/50'
            }`}
          >
            {t(g === 'month' ? 'ledger.byMonth' : 'ledger.byYear')}
          </button>
        ))}
      </div>

      {/* 期间 + 收支结余 */}
      <div className="bg-white rounded-xl shadow-card px-2 py-3 mb-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setPeriod((p) => shiftPeriod(p, -1))} className="p-2 text-ink/50">
            <ChevronLeft size={18} />
          </button>
          <p className="font-mono text-sm text-ink/60">{period}</p>
          <button
            onClick={() => setPeriod((p) => shiftPeriod(p, 1))}
            disabled={isFuturePeriod(shiftPeriod(period, 1))}
            className="p-2 text-ink/50 disabled:opacity-25"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-1 text-center">
          <div>
            <p className="text-[11px] text-ink/40 flex items-center justify-center gap-0.5">
              <ArrowUpRight size={11} className="text-persimmon" /> {t('ledger.kindExpense')}
            </p>
            <p className="font-display font-bold text-persimmon text-sm mt-0.5">
              {formatTotals(totals.expense, locale)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-ink/40 flex items-center justify-center gap-0.5">
              <ArrowDownLeft size={11} className="text-matcha" /> {t('ledger.kindIncome')}
            </p>
            <p className="font-display font-bold text-matcha text-sm mt-0.5">
              {formatTotals(totals.income, locale)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-ink/40">{t('ledger.net')}</p>
            <p className="font-display font-bold text-indigo text-sm mt-0.5">
              {formatTotals(totals.net, locale)}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-ink/35 text-center mt-1">{scopeName}</p>
      </div>

      {error && <p className="text-persimmon text-sm mb-3">{error}</p>}

      {/* 账本切换 */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-4 px-4">
        {[
          { key: 'all', label: t('ledger.allLedgers') },
          { key: 'daily', label: t('ledger.daily') },
          ...visibleLedgers.map((l) => ({ key: String(l.id), label: l.name, archived: !!l.archivedAt })),
        ].map((x) => (
          <button
            key={x.key}
            onClick={() => setScope(x.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${
              String(scope) === x.key
                ? 'bg-indigo text-porcelain border-indigo'
                : 'border-mist text-ink/55 bg-white'
            } ${x.archived ? 'opacity-50' : ''}`}
          >
            {x.label}
          </button>
        ))}
        <button
          onClick={() => setLedgerDraft({ name: '', note: '', startsOn: '', endsOn: '', currency: '' })}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-indigo/50 text-indigo flex items-center gap-1"
        >
          <FolderPlus size={13} /> {t('ledger.newLedger')}
        </button>
      </div>

      {/* 分类明细：支出榜 / 收入榜 */}
      {overview?.byCategory && (
        <div className="bg-white rounded-xl shadow-card p-3 mb-4">
          <div className="flex gap-1 mb-3 bg-mist/50 rounded-lg p-0.5">
            {['expense', 'income'].map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 py-1 rounded-md text-xs font-medium ${
                  tab === k ? 'bg-white text-indigo shadow-sm' : 'text-ink/45'
                }`}
              >
                {t(k === 'expense' ? 'ledger.kindExpense' : 'ledger.kindIncome')}
              </button>
            ))}
          </div>
          <CategoryBreakdown
            byCategory={overview.byCategory[tab]}
            categories={meta.categories?.[tab] ?? []}
            title={t('ledger.byCategory')}
            emptyText={t('ledger.noEntries')}
          />
        </div>
      )}

      {/* 子账本一览 */}
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
            const kinds = byLedgerKinds[String(l.id)];
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
                  </button>
                  <div className="text-right shrink-0">
                    <p className="font-display font-bold text-sm text-persimmon">
                      {formatTotals(kinds?.expense, locale)}
                    </p>
                    {kinds?.income?.length > 0 && (
                      <p className="text-[11px] text-matcha font-mono">
                        +{formatTotals(kinds.income, locale)}
                      </p>
                    )}
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
                    className="flex-1 py-1.5 text-ink/40 flex justify-center" aria-label={t('common.edit')}
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

      {/* 明细 */}
      <p className="text-xs text-ink/50 mb-2">{t('ledger.entries')}</p>
      {scoped.length === 0 ? (
        <p className="text-center text-ink/35 text-sm py-6">{t('ledger.noEntries')}</p>
      ) : (
        <ul className="bg-white rounded-xl shadow-card divide-y divide-mist">
          {scoped.map((e) => {
            const income = e.kind === 'income';
            const icon = (meta.categories?.[e.kind] ?? []).find((c) => c.value === e.category)?.icon;
            return (
              <li key={e.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="w-8 h-8 rounded-full bg-mist/70 text-ink/55 flex items-center justify-center shrink-0">
                  <CategoryIcon name={icon} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    {e.note || domainLabel(locale, 'expenseCategory', e.category)}
                  </p>
                  <p className="text-[11px] text-ink/40 font-mono">
                    {e.spentOn}
                    {e.ledgerName ? ` · ${e.ledgerName}` : ''}
                    {e.paidByName ? ` · ${e.paidByName}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-mono text-sm ${income ? 'text-matcha' : 'text-ink'}`}>
                    {income ? '+' : '−'}{formatMoney(e.amount, e.currency, locale)}
                  </p>
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => {
                        setEntryError('');
                        setEntry({
                          id: e.id, kind: e.kind, amount: String(e.amount), currency: e.currency,
                          spentOn: e.spentOn, category: e.category,
                          ledgerId: e.ledgerId ?? 'daily', note: e.note, paidBy: e.paidBy,
                        });
                      }}
                      className="text-ink/30 p-1" aria-label={t('common.edit')}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(t('ledger.deleteExpenseConfirm'))) run(() => deleteExpense(e.id));
                      }}
                      className="text-ink/30 p-1" aria-label={t('common.delete')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 记一笔：全屏面板 */}
      {entry && (
        <ExpenseEntrySheet
          draft={entry}
          meta={meta}
          ledgers={ledgers}
          members={members}
          onChange={setEntry}
          onSubmit={saveEntry}
          onClose={() => setEntry(null)}
          busy={busy}
          error={entryError}
        />
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
                    type="date" value={ledgerDraft.startsOn}
                    onChange={(e) => setLedgerDraft({ ...ledgerDraft, startsOn: e.target.value })}
                    className="w-full px-2 py-2 rounded-lg border border-mist outline-none text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-ink/50 block mb-1">{t('ledger.endsOn')}</label>
                  <input
                    type="date" value={ledgerDraft.endsOn}
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
