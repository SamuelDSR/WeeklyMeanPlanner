import { useEffect, useState } from 'react';
import { Wheat, Plus, Trash2, Check } from 'lucide-react';
import {
  fetchStaples,
  createStaple,
  updateStaple,
  deleteStaple,
  updateStapleSettings,
} from '../lib/familyData';
import { fetchUnitGroups } from '../lib/unitOptions';
import { MEAL_SLOTS } from '../lib/constants';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 主食设置：家里都吃哪些主食、每人一顿吃多少、默认配哪一种、哪几顿配。
//
// 「每人一顿吃多少」是这一页的重点 —— 购物清单就是靠它算总量的：
//   75 g/人 x 3 口人 x 一周 10 顿 = 2250 g 米
export default function StaplePanel() {
  const { t, locale } = useI18n();
  const [staples, setStaples] = useState([]);
  const [settings, setSettings] = useState({ defaultStapleId: null, stapleMeals: [] });
  const [unitGroups, setUnitGroups] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', amountPerPerson: '', unit: 'g' });

  function apply(data) {
    setStaples(data.staples || []);
    setSettings(data.settings || { defaultStapleId: null, stapleMeals: [] });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStaples(), fetchUnitGroups().catch(() => [])])
      .then(([data, groups]) => {
        if (cancelled) return;
        apply(data);
        setUnitGroups(groups);
        setLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t('common.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 所有写操作都返回完整的最新状态，直接整体替换，不用自己去拼本地状态
  async function run(fn) {
    setError('');
    try {
      apply(await fn());
    } catch (err) {
      setError(err.message || t('common.saveFailed'));
    }
  }

  async function handleAdd() {
    const name = draft.name.trim();
    const amount = Number(draft.amountPerPerson);
    if (!name || !Number.isFinite(amount) || amount <= 0) {
      setError(t('staple.invalidDraft'));
      return;
    }
    await run(async () => {
      const data = await createStaple({
        name,
        amountPerPerson: amount,
        unit: draft.unit || 'g',
        category: '干货粮油',
      });
      setDraft({ name: '', amountPerPerson: '', unit: 'g' });
      setAdding(false);
      return data;
    });
  }

  function toggleMeal(meal) {
    const next = settings.stapleMeals.includes(meal)
      ? settings.stapleMeals.filter((m) => m !== meal)
      : [...settings.stapleMeals, meal];
    run(() => updateStapleSettings({ stapleMeals: next }));
  }

  if (!loaded && !error) {
    return (
      <section className="bg-white rounded-xl shadow-card p-3.5">
        <p className="text-sm text-ink/40">{t('common.loading')}</p>
      </section>
    );
  }

  const knownUnits = new Set(unitGroups.flatMap((g) => g.units));

  return (
    <section className="bg-white rounded-xl shadow-card p-3.5">
      <h4 className="font-display font-semibold flex items-center gap-2 mb-1">
        <Wheat size={17} className="text-wheat" /> {t('staple.title')}
      </h4>
      <p className="text-xs text-ink/45 leading-relaxed mb-3">{t('staple.intro')}</p>

      {error && <p className="text-persimmon text-sm mb-2">{error}</p>}

      {/* 哪几顿自动配主食 */}
      <p className="text-xs text-ink/60 mb-1.5">{t('staple.whichMeals')}</p>
      <div className="flex gap-2 mb-3">
        {MEAL_SLOTS.map((meal) => (
          <button
            key={meal}
            type="button"
            onClick={() => toggleMeal(meal)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              settings.stapleMeals.includes(meal)
                ? 'bg-wheat text-white border-wheat'
                : 'border-mist text-ink/50'
            }`}
          >
            {domainLabel(locale, 'meal', meal)}
          </button>
        ))}
      </div>

      {/* 主食清单。点左边的圆点把它设成默认。 */}
      <p className="text-xs text-ink/60 mb-1.5">{t('staple.listLabel')}</p>
      <ul className="divide-y divide-mist border-y border-mist">
        {staples.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2">
            <button
              type="button"
              onClick={() => run(() => updateStapleSettings({ defaultStapleId: s.id }))}
              title={t('staple.setDefault')}
              aria-pressed={settings.defaultStapleId === s.id}
              className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center ${
                settings.defaultStapleId === s.id
                  ? 'bg-wheat border-wheat text-white'
                  : 'border-mist text-transparent'
              }`}
            >
              <Check size={12} />
            </button>
            <span className="flex-1 min-w-0 truncate text-sm">
              {domainLabel(locale, 'staple', s.name)}
              {settings.defaultStapleId === s.id && (
                <span className="ml-1.5 text-[10px] text-wheat">{t('staple.defaultTag')}</span>
              )}
            </span>
            {/* 每人一顿吃多少 —— 直接在行里改，失焦就保存 */}
            <input
              type="number"
              min="0"
              step="any"
              defaultValue={s.amountPerPerson}
              onBlur={(e) => {
                const amount = Number(e.target.value);
                if (Number.isFinite(amount) && amount > 0 && amount !== s.amountPerPerson) {
                  run(() => updateStaple(s.id, { amountPerPerson: amount }));
                }
              }}
              className="w-16 px-1.5 py-1 rounded-md border border-mist text-sm font-mono text-right outline-none"
            />
            <select
              value={s.unit}
              onChange={(e) => run(() => updateStaple(s.id, { unit: e.target.value }))}
              className="w-16 px-1 py-1 rounded-md border border-mist text-xs outline-none"
            >
              {!knownUnits.has(s.unit) && <option value={s.unit}>{s.unit}</option>}
              {unitGroups.flatMap((g) => g.units).map((u) => (
                <option key={u} value={u}>
                  {domainLabel(locale, 'unit', u)}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-ink/35 shrink-0">{t('staple.perPerson')}</span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('staple.deleteConfirm', { name: s.name }))) {
                  run(() => deleteStaple(s.id));
                }
              }}
              className="text-ink/25 shrink-0"
              aria-label={t('common.delete')}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {staples.length === 0 && (
          <li className="py-2 text-sm text-ink/35">{t('staple.empty')}</li>
        )}
      </ul>

      {adding ? (
        <div className="flex gap-1.5 items-center mt-2">
          <input
            autoFocus
            placeholder={t('staple.namePlaceholder')}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-mist text-sm outline-none"
          />
          <input
            type="number"
            min="0"
            step="any"
            placeholder={t('staple.amountPlaceholder')}
            value={draft.amountPerPerson}
            onChange={(e) => setDraft({ ...draft, amountPerPerson: e.target.value })}
            className="w-16 px-1.5 py-1.5 rounded-md border border-mist text-sm font-mono outline-none"
          />
          <select
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            className="w-16 px-1 py-1.5 rounded-md border border-mist text-xs outline-none"
          >
            {unitGroups.flatMap((g) => g.units).map((u) => (
              <option key={u} value={u}>
                {domainLabel(locale, 'unit', u)}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleAdd} className="text-sm text-indigo font-medium px-1">
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-sm text-ink/40 px-1"
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-sm text-indigo flex items-center gap-1"
        >
          <Plus size={15} /> {t('staple.add')}
        </button>
      )}
    </section>
  );
}
