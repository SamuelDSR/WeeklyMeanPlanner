import { X, Plus, UtensilsCrossed, Wheat } from 'lucide-react';
import { MEAL_SLOTS } from '../lib/constants';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 一顿饭的主食选择器。
//
// 值的三种情况：
//   ''      跟着家庭默认（后端删掉这一顿的例外）
//   'none'  这一顿不要主食
//   '<id>'  指定某个主食
function StapleRow({ staple, staples, onSelect, t, locale }) {
  // 当前实际吃的是什么：解析结果为空就是「没有主食」
  const current = staple ? String(staple.stapleId ?? '') : 'none';
  const isDefault = staple?.source === 'default';

  return (
    <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-mist/60">
      <Wheat size={11} className={isDefault ? 'text-ink/25 shrink-0' : 'text-wheat shrink-0'} />
      <select
        value={staple?.source === 'default' ? '' : current}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onSelect('reset');
          else if (v === 'none') onSelect('none');
          else onSelect('set', Number(v));
        }}
        className={`flex-1 min-w-0 text-[11px] px-1 py-1 rounded border-0 bg-transparent outline-none ${
          isDefault ? 'text-ink/40' : 'text-wheat font-medium'
        }`}
        title={t('menu.stapleTitle')}
      >
        {/* 「跟随默认」这一项的文字里带上默认到底是什么，不用去设置页查 */}
        <option value="">
          {staple && isDefault
            ? t('menu.stapleDefaultIs', { name: domainLabel(locale, 'staple', staple.name) })
            : t('menu.stapleFollowDefault')}
        </option>
        {staples.map((s) => (
          <option key={s.id} value={s.id}>
            {domainLabel(locale, 'staple', s.name)}
          </option>
        ))}
        <option value="none">{t('menu.stapleNone')}</option>
      </select>
    </div>
  );
}

// 一天的四餐。每一顿可以配好几道菜：已选的用小标签列出来，下面的下拉框往里加菜。
export default function MenuDayCard({
  day,
  recipes,
  staples = [],
  stapleByMeal = {},
  onChangeSlot,
  onToggleEatOut,
  onSetStaple,
}) {
  const { t, locale, formatWeekday } = useI18n();
  const recipeName = (id) => recipes.find((r) => r.id === id)?.name || t('menu.deletedRecipe');
  const optionsFor = (meal, chosen) =>
    recipes.filter((r) => (r.meals || []).includes(meal) && !chosen.includes(r.id));

  return (
    <div className="bg-white rounded-xl shadow-card p-3">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-display font-bold">{formatWeekday(day.date, 'long')}</span>
        <span className="text-xs text-ink/40 font-mono">{day.date}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MEAL_SLOTS.map((meal) => {
          const chosen = day[meal] || [];
          const mealLabel = domainLabel(locale, 'meal', meal);
          const eatOut = (day.eatOut || []).includes(meal);
          const options = optionsFor(meal, chosen);

          return (
            <div
              key={meal}
              className={`border rounded-lg p-2 ${eatOut ? 'border-wheat bg-wheat/5' : 'border-mist'}`}
            >
              {/* 出去吃按钮用 px/py 撑出点击面积，再用负 margin 把视觉位置拉回来 */}
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-ink/40">{mealLabel}</label>
                {/* 出去吃：这一顿不做饭，也不进购物清单 */}
                <button
                  type="button"
                  onClick={() => onToggleEatOut(day.date, meal, !eatOut)}
                  className={`text-[11px] flex items-center gap-0.5 px-2 py-1.5 -mr-1 -my-1 rounded ${
                    eatOut ? 'text-wheat font-medium' : 'text-ink/35'
                  }`}
                  title={eatOut ? t('menu.eatOutToggleOff') : t('menu.eatOutToggleOn')}
                >
                  <UtensilsCrossed size={12} /> {t('menu.eatOut')}
                </button>
              </div>

              {eatOut ? (
                <p className="text-xs text-wheat/90 mt-1.5 py-1">{t('menu.eatOutOn')}</p>
              ) : (
                <>

              {chosen.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 mb-1.5">
                  {chosen.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center bg-indigo/10 text-indigo text-xs pl-2.5 rounded-full max-w-full"
                    >
                      <span className="truncate py-1.5">{recipeName(id)}</span>
                      <button
                        type="button"
                        aria-label={t('menu.removeFrom', { meal: mealLabel, name: recipeName(id) })}
                        onClick={() => onChangeSlot(day.date, meal, chosen.filter((x) => x !== id))}
                        className="shrink-0 p-2 active:text-persimmon"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {options.length > 0 ? (
                <select
                  value=""
                  onChange={(e) =>
                    e.target.value && onChangeSlot(day.date, meal, [...chosen, Number(e.target.value)])
                  }
                  className="w-full text-xs px-1.5 py-2 rounded-md border border-mist bg-porcelain outline-none text-ink/60"
                >
                  <option value="">
                    {chosen.length > 0 ? t('menu.addAnother') : t('menu.addDish')}
                  </option>
                  {options.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                chosen.length === 0 && (
                  <p className="text-[11px] text-ink/25 mt-1 flex items-center gap-0.5">
                    <Plus size={10} /> {t('menu.noDishForMeal')}
                  </p>
                )
              )}

              {/* 主食（米饭 / 面条…）。跟着家庭默认走的显示成浅色，
                  这一顿单独改过的显示成实色 —— 一眼能看出哪顿是特意换过的。 */}
              {staples.length > 0 && (
                <StapleRow
                  staple={stapleByMeal[meal]}
                  staples={staples}
                  onSelect={(mode, id) => onSetStaple(day.date, meal, mode, id)}
                  t={t}
                  locale={locale}
                />
              )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
