import { Link } from 'react-router-dom';
import { UtensilsCrossed, ShoppingBag } from 'lucide-react';
import ScorePicker from './ScorePicker';
import ScoreBadges from './ScoreBadges';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 一周的吃饭记录。同一顿有好几道菜时按 日期+餐次 归到一行显示。
function groupByMeal(meals) {
  const groups = new Map();
  meals.forEach((m) => {
    const key = `${m.date}|${m.mealSlot}`;
    if (!groups.has(key)) {
      groups.set(key, { date: m.date, weekday: m.weekday, mealSlot: m.mealSlot, eatOut: false, dishes: [] });
    }
    const g = groups.get(key);
    if (m.eatOut) g.eatOut = true;
    else g.dishes.push(m);
  });
  return Array.from(groups.values());
}

export default function HistoryWeekCard({ week, onRateMeal, ratingId }) {
  const { t, locale, formatDate, formatWeekday } = useI18n();
  const groups = groupByMeal(week.meals);
  const { stats } = week;
  const inProgress = !week.confirmedAt;

  return (
    <div className="bg-white rounded-xl shadow-card p-3.5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-display font-bold flex items-center gap-2">
          {t('history.weekOf', { date: formatDate(week.weekStart) })}
          {inProgress && (
            <span className="text-[10px] font-sans font-medium text-wheat bg-wheat/15 px-1.5 py-0.5 rounded">
              {t('history.inProgress')}
            </span>
          )}
        </h3>
        <span className="text-xs text-ink/40">{t('history.atHomeCount', { count: stats.dishMeals })}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/50 mb-2.5">
        {stats.avgHealth != null && (
          <span className="flex items-center gap-1">
            {t('history.avgHealth')} <b className="text-matcha font-mono">{stats.avgHealth}</b>
          </span>
        )}
        {stats.avgLike != null && (
          <span className="flex items-center gap-1">
            {t('history.avgLike')} <b className="text-persimmon font-mono">{stats.avgLike}</b>
          </span>
        )}
        {stats.eatOutMeals > 0 && (
          <span className="flex items-center gap-1">
            <UtensilsCrossed size={11} /> {t('history.eatOutCount', { count: stats.eatOutMeals })}
          </span>
        )}
        {stats.storeBoughtMeals > 0 && (
          <span className="flex items-center gap-1">
            <ShoppingBag size={11} /> {t('history.storeBoughtCount', { count: stats.storeBoughtMeals })}
          </span>
        )}
      </div>

      <ul className="divide-y divide-mist">
        {groups.map((g) => (
          <li key={`${g.date}|${g.mealSlot}`} className="py-1.5 flex items-start gap-2 text-sm">
            <span className="text-xs text-ink/40 font-mono w-20 shrink-0 pt-0.5">
              {formatWeekday(g.date)} {domainLabel(locale, 'meal', g.mealSlot)}
            </span>
            <div className="min-w-0 flex-1">
              {g.eatOut ? (
                <span className="text-wheat text-sm flex items-center gap-1">
                  <UtensilsCrossed size={12} /> {t('history.eatOut')}
                </span>
              ) : (
                // 手机上一行塞不下"菜名 + 5个健康图标 + 5个可点的心"，
                // 所以菜名和健康分一行，可点的喜好分单独一行（心才有地方长大）
                g.dishes.map((d) => (
                  <div key={d.slotId} className="py-1">
                    <div className="flex items-baseline justify-between gap-2">
                      {/* 菜谱还在就可以点进去照着做；删掉的只剩快照文字 */}
                      {d.recipeId ? (
                        <Link
                          to={`/recipes/${d.recipeId}`}
                          className="truncate text-indigo hover:underline"
                          title={t('common.openRecipe', { name: d.recipeName })}
                        >
                          {d.recipeName}
                        </Link>
                      ) : (
                        <span className="truncate flex items-center gap-1">
                          {d.recipeName || t('history.missingRecord')}
                          <span className="text-[10px] text-ink/30 shrink-0">
                            {t('history.recipeDeleted')}
                          </span>
                        </span>
                      )}
                      <ScoreBadges healthScore={d.healthScore} className="shrink-0" />
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {/* 这一顿的喜好分：点一下就改，点已选中的取消回默认值 */}
                      <ScorePicker
                        kind="like"
                        value={d.likeScore}
                        readOnly={ratingId === d.slotId}
                        onChange={(v) => onRateMeal?.(d.slotId, v)}
                      />
                      {d.mealLikeScore == null && d.likeScore != null && (
                        <span className="text-[10px] text-ink/25 shrink-0">{t('history.fromDefault')}</span>
                      )}
                      {d.mealLikeScore != null && (
                        <span className="text-[10px] text-persimmon/70 shrink-0">{t('history.thisMeal')}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </li>
        ))}
        {groups.length === 0 && <li className="py-2 text-sm text-ink/30">{t('history.noDishes')}</li>}
      </ul>
    </div>
  );
}
