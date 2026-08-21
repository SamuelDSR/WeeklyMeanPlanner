import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, History as HistoryIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchHistory, rateMeal } from '../lib/familyData';
import HistoryWeekCard from '../components/HistoryWeekCard';
import ScorePicker from '../components/ScorePicker';
import { useI18n } from '../i18n';

export default function MealHistory() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ratingId, setRatingId] = useState(null);
  const { t } = useI18n();
  // 当前看的是第几周（0 = 最近一周）
  const [weekIndex, setWeekIndex] = useState(0);

  // 给某一顿打分：存完重新拉一次，均分和「实际」分数才是最新的
  async function handleRateMeal(slotId, likeScore) {
    setError('');
    setRatingId(slotId);
    try {
      await rateMeal(slotId, likeScore);
      setData(await fetchHistory());
    } catch (err) {
      setError(err.message || t('history.rateFailed'));
    } finally {
      setRatingId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchHistory()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message || t('common.loadFailed')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="p-6 text-center text-ink/40">{t('common.loading')}</div>;
  if (error) return <div className="p-6 text-center text-persimmon">{error}</div>;

  const { weeks, overall, topDishes } = data;
  // 数据变少时（比如取消确认）把游标收回来，别指到不存在的那一周
  const safeIndex = Math.min(weekIndex, Math.max(0, weeks.length - 1));
  const currentWeek = weeks[safeIndex];

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/menu" className="text-ink/50">
          <ArrowLeft size={18} />
        </Link>
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <HistoryIcon size={19} className="text-indigo" /> {t('history.title')}
        </h2>
      </div>

      {error && (
        <p className="text-persimmon text-sm bg-persimmon/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {weeks.length === 0 ? (
        <p className="text-center text-ink/40 text-sm mt-10 leading-relaxed">
          {t('history.empty')}
          <br />
          {t('history.emptyHint')}
        </p>
      ) : (
        <>
          <p className="text-xs text-ink/40 leading-relaxed">
            {t('history.rateHint')}
          </p>

          {/* 总览 */}
          <div className="bg-white rounded-xl shadow-card p-3.5">
            <h3 className="text-sm font-medium text-ink/60 mb-2">
              {t('history.overviewTitle', { count: overall.weeks })}
            </h3>
            <div className="grid grid-cols-2 gap-y-2.5 text-sm">
              <div>
                <p className="text-xs text-ink/40">{t('history.atHome')}</p>
                <p className="font-mono text-lg">{t('history.mealsCount', { count: overall.dishMeals })}</p>
              </div>
              <div>
                <p className="text-xs text-ink/40">{t('history.eatOut')}</p>
                <p className="font-mono text-lg text-wheat">{t('history.mealsCount', { count: overall.eatOutMeals })}</p>
              </div>
              <div>
                <p className="text-xs text-ink/40 mb-0.5">{t('history.avgHealth')}</p>
                {overall.avgHealth != null ? (
                  <div className="flex items-center gap-2">
                    <ScorePicker kind="health" value={Math.round(overall.avgHealth)} readOnly size={13} />
                    <span className="font-mono text-sm text-matcha">{overall.avgHealth}</span>
                  </div>
                ) : (
                  <p className="text-xs text-ink/30">{t('history.notRatedYet')}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-ink/40 mb-0.5">{t('history.avgLike')}</p>
                {overall.avgLike != null ? (
                  <div className="flex items-center gap-2">
                    <ScorePicker kind="like" value={Math.round(overall.avgLike)} readOnly size={13} />
                    <span className="font-mono text-sm text-persimmon">{overall.avgLike}</span>
                  </div>
                ) : (
                  <p className="text-xs text-ink/30">{t('history.notRatedYet')}</p>
                )}
              </div>
            </div>
            {overall.ratedMeals < overall.dishMeals && (
              <p className="text-xs text-ink/35 mt-2.5">
                {t('history.ratedNote', { rated: overall.ratedMeals, total: overall.dishMeals })}
              </p>
            )}
          </div>

          {/* 吃得最多的菜 */}
          {topDishes.length > 0 && (
            <div className="bg-white rounded-xl shadow-card p-3.5">
              <h3 className="text-sm font-medium text-ink/60 mb-2">{t('history.topTitle')}</h3>
              <ul className="divide-y divide-mist">
                {topDishes.map((d) => (
                  <li key={d.recipeId} className="flex items-center justify-between py-1.5 text-sm gap-2">
                    {/* 菜谱还在就可以点进去照着做；已经删掉的就只是文字 */}
                    {d.recipeId ? (
                      <Link
                        to={`/recipes/${d.recipeId}`}
                        className="truncate text-indigo hover:underline"
                        title={t('common.openRecipe', { name: d.name })}
                      >
                        {d.name}
                      </Link>
                    ) : (
                      <span className="truncate">{d.name || t('menu.deletedRecipe')}</span>
                    )}
                    <span className="flex items-center gap-2 shrink-0">
                      <ScorePicker kind="health" value={d.healthScore} readOnly size={11} />
                      <span className="font-mono text-xs text-ink/50">{t('history.mealsCount', { count: d.count })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 一次看一周，用 < > 翻。weeks 是从新到旧排的，
              所以「更早」是 index + 1，「更近」是 index - 1。 */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setWeekIndex(Math.min(safeIndex + 1, weeks.length - 1))}
              disabled={safeIndex >= weeks.length - 1}
              aria-label={t('history.prevWeek')}
              className="p-2.5 rounded-lg border border-mist text-ink/50 disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="text-center">
              <p className="text-xs text-ink/45 font-mono">
                {t('history.weekPosition', { n: safeIndex + 1, total: weeks.length })}
              </p>
              {safeIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setWeekIndex(0)}
                  className="text-xs text-indigo mt-0.5"
                >
                  {t('history.backToLatest')}
                </button>
              )}
              {safeIndex === 0 && (
                <p className="text-[11px] text-ink/30 mt-0.5">{t('history.latestWeek')}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setWeekIndex(Math.max(safeIndex - 1, 0))}
              disabled={safeIndex === 0}
              aria-label={t('history.nextWeek')}
              className="p-2.5 rounded-lg border border-mist text-ink/50 disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {currentWeek && (
            <HistoryWeekCard
              week={currentWeek}
              onRateMeal={handleRateMeal}
              ratingId={ratingId}
            />
          )}
        </>
      )}
    </div>
  );
}
