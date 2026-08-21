import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChefHat, ShoppingBag } from 'lucide-react';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 本周备餐计划：每道菜要做几份，以及家庭人数的设置入口。
//
//   出现 4 顿 x 家里 3 口 = 12 人份，一份够 4 人 -> 做 3 份
//
// 份数是服务端算的（server/src/portions.js），这里只负责显示。
export default function MealPlanSummary({ plan, memberCount, onChangeMemberCount }) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memberCount ?? 2);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await onChangeMemberCount(Number(draft));
      setEditing(false);
    } catch (err) {
      setError(err.message || t('common.saveFailed'));
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-3 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-1.5">
          <ChefHat size={15} className="text-indigo" /> {t('menu.planTitle')}
        </h3>

        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="1"
              max="50"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-14 px-2 py-1 rounded-md border border-mist text-sm font-mono outline-none"
            />
            <span className="text-xs text-ink/40">{t('menu.membersUnit')}</span>
            <button onClick={save} className="text-xs text-indigo font-medium">
              {t('common.save')}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setDraft(memberCount ?? 2);
              }}
              className="text-xs text-ink/40"
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-ink/50 flex items-center gap-1 px-2 py-1.5 -my-1 -mr-1 rounded border border-mist"
          >
            <Users size={14} /> {memberCount == null ? t('menu.membersUnit') : t('menu.members', { count: memberCount })}
          </button>
        )}
      </div>

      {error && <p className="text-persimmon text-xs mt-1.5">{error}</p>}

      {plan?.length > 0 ? (
        <ul className="mt-2 divide-y divide-mist">
          {plan.map((p) => (
            <li key={p.recipeId} className="flex items-baseline justify-between py-1.5 text-sm">
              {/* 菜名可点：直接跳到做法。plan 是按现有菜谱算出来的，
                  所以这里的 recipeId 一定还在（删掉的菜不会出现在计划里） */}
              <Link
                to={`/recipes/${p.recipeId}`}
                className="min-w-0 truncate flex items-center gap-1 text-indigo hover:underline"
                title={t('common.openRecipe', { name: p.name })}
              >
                {p.isStoreBought && <ShoppingBag size={12} className="text-wheat shrink-0" />}
                {p.name}
              </Link>
              <span className="text-ink/50 text-xs font-mono shrink-0 ml-2">
                {t('menu.planLine', { meals: p.occurrences, portions: p.portionsNeeded })}
                {p.isStoreBought ? (
                  <span className="text-wheat font-bold">
                    {' '}
                    {p.purchase
                      ? t('menu.buy', {
                          qty: p.purchase.qty,
                          unit: domainLabel(locale, 'unit', p.purchase.unit),
                        })
                      : t('menu.buyServings', { count: p.batches })}
                  </span>
                ) : (
                  <span className="text-indigo font-bold"> {t('menu.cook', { count: p.batches })}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink/35 mt-2">{t('menu.planEmpty')}</p>
      )}
    </div>
  );
}
