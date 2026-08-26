import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Clock, ImageOff, ShoppingBag } from 'lucide-react';
import ScoreBadges from '../components/ScoreBadges';
import { useI18n } from '../i18n';
import EatTabs from '../components/EatTabs';
import { domainLabel } from '../i18n/domain';
import { useAuth } from '../context/AuthContext';
import { subscribeRecipes } from '../lib/familyData';

// 分类是数据库里的值（recipes.category），只在显示时翻译
const CATEGORIES = ['全部', '蔬菜', '水果', '肉类', '鱼类', '蛋奶豆制品', '主食', '汤羹'];

export default function RecipeLibrary() {
  const { family } = useAuth();
  const { t, locale } = useI18n();
  const [recipes, setRecipes] = useState([]);
  const [filter, setFilter] = useState('全部');

  useEffect(() => {
    if (!family?.id) return;
    return subscribeRecipes(setRecipes);
  }, [family?.id]);

  const filtered = useMemo(
    () =>
      filter === '全部'
        ? recipes
        : recipes.filter((r) => (r.category || '').includes(filter)),
    [recipes, filter]
  );

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
      <EatTabs />
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-xl">{t('recipes.title')}</h2>
        <Link
          to="/recipes/new"
          className="flex items-center gap-1 bg-indigo text-porcelain text-sm px-3 py-1.5 rounded-full font-medium"
        >
          <Plus size={16} /> {t('recipes.add')}
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`shrink-0 px-3 py-1 rounded-full text-sm border ${
              filter === cat
                ? 'bg-indigo text-porcelain border-indigo'
                : 'border-mist text-ink/60'
            }`}
          >
            {domainLabel(locale, 'recipeCategory', cat)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-ink/40 mt-16 text-sm">
          {recipes.length === 0
            ? t('recipes.emptyAll')
            : t('recipes.emptyCategory')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-2">
          {filtered.map((r) => (
            <Link
              key={r.id}
              to={`/recipes/${r.id}`}
              className="bg-white rounded-xl shadow-card overflow-hidden border-t-2 border-wheat"
            >
              <div className="aspect-[4/3] bg-mist flex items-center justify-center relative">
                {r.isStoreBought && (
                  <span className="absolute top-1.5 left-1.5 z-[1] inline-flex items-center gap-0.5 bg-wheat text-porcelain text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                    <ShoppingBag size={9} /> {t('recipes.storeBought')}
                  </span>
                )}
                {r.photoURL ? (
                  // 列表用 400px 的缩略图；老数据没有缩略图就退回主图
                  <img
                    src={r.thumbURL || r.photoURL}
                    alt={r.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageOff className="text-ink/20" size={28} />
                )}
              </div>
              <div className="p-2.5">
                <p className="font-display font-semibold text-sm truncate">{r.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-ink/50 truncate">
                    {domainLabel(locale, 'recipeCategory', r.category)}
                  </span>
                  {!r.isStoreBought && (
                    <span className="flex items-center gap-0.5 text-[11px] text-ink/40 font-mono shrink-0">
                      <Clock size={11} /> {t('recipes.minutes', { n: r.timeMinutes })}
                    </span>
                  )}
                </div>
                {/* 喜好分优先显示"真吃过之后的均分"，没吃过就显示菜谱上填的默认值。
                    卡片一行放不下 5 个图标，所以用「图标 + 数字」的紧凑形式。 */}
                <ScoreBadges
                  healthScore={r.healthScore}
                  likeScore={r.mealLikeCount > 0 ? r.mealLikeAvg : r.likeScore}
                  likeMealCount={r.mealLikeCount}
                  className="mt-1"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
