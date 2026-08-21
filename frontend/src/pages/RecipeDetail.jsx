import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Clock, ChevronLeft, ChevronRight, X, ImageOff, Users, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeRecipes } from '../lib/familyData';
import StepTimer from '../components/StepTimer';
import ScorePicker from '../components/ScorePicker';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

export default function RecipeDetail() {
  const { t, locale } = useI18n();
  const { family } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(undefined);
  const [cookingMode, setCookingMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!family?.id) return;
    return subscribeRecipes((recipes) => {
      setRecipe(recipes.find((r) => r.id === Number(id)) || null);
    });
  }, [family?.id, id]);

  if (recipe === undefined) return <div className="p-6 text-center text-ink/40">{t('common.loading')}</div>;
  if (recipe === null) return <div className="p-6 text-center text-ink/40">{t('recipe.notFound')}</div>;

  const steps = recipe.steps || [];

  if (cookingMode && steps.length > 0) {
    const step = steps[stepIndex];
    return (
      <div className="fixed inset-0 bg-porcelain z-30 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-mist pt-safe">
          <span className="font-display font-bold">{recipe.name}</span>
          <button onClick={() => setCookingMode(false)} className="text-ink/50">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <div className="flex justify-center gap-1.5 mb-6">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? 'w-6 bg-indigo' : 'w-1.5 bg-mist'
                }`}
              />
            ))}
          </div>
          <p className="font-mono text-wheat text-sm mb-1">
            {t('recipe.stepOf', { n: stepIndex + 1, total: steps.length })}
          </p>
          <h3 className="font-display font-bold text-2xl mb-4">{step.title || t('recipe.stepFallback')}</h3>
          <p className="text-lg leading-relaxed text-ink/80">{step.content}</p>
          {step.photoURL && (
            <img
              src={step.photoURL}
              alt={step.title || t('recipe.stepPhotoAlt')}
              className="mt-4 w-full max-h-64 object-contain rounded-lg border border-mist"
            />
          )}
          {step.timerSeconds > 0 && <StepTimer seconds={step.timerSeconds} />}
        </div>

        <div className="flex border-t border-mist pb-safe">
          <button
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => i - 1)}
            className="flex-1 py-4 flex items-center justify-center gap-1 text-ink/50 disabled:opacity-30"
          >
            <ChevronLeft size={20} /> {t('recipe.prev')}
          </button>
          <div className="w-px bg-mist" />
          {stepIndex < steps.length - 1 ? (
            <button
              onClick={() => setStepIndex((i) => i + 1)}
              className="flex-1 py-4 flex items-center justify-center gap-1 text-indigo font-medium"
            >
              {t('recipe.next')} <ChevronRight size={20} />
            </button>
          ) : (
            <button
              onClick={() => setCookingMode(false)}
              className="flex-1 py-4 flex items-center justify-center gap-1 text-persimmon font-medium"
            >
              {t('recipe.allDone')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-nav">
      <div className="relative aspect-[4/3] bg-mist">
        {recipe.photoURL ? (
          <img src={recipe.photoURL} alt={recipe.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="text-ink/20" size={40} />
          </div>
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-3 left-3 bg-porcelain/90 rounded-full p-2 shadow-card"
        >
          <ArrowLeft size={18} />
        </button>
        <Link
          to={`/recipes/${id}/edit`}
          className="absolute top-3 right-3 bg-porcelain/90 rounded-full p-2 shadow-card"
        >
          <Pencil size={18} />
        </Link>
      </div>

      <div className="px-4 pt-4">
        <h2 className="font-display font-bold text-2xl">{recipe.name}</h2>
        <div className="flex items-center gap-3 mt-1.5 text-sm text-ink/50">
          <span className="bg-wheat/20 text-wheat px-2 py-0.5 rounded-full text-xs font-medium">
            {domainLabel(locale, 'recipeCategory', recipe.category)}
          </span>
          {recipe.isStoreBought && (
            <span className="inline-flex items-center gap-1 bg-wheat text-porcelain px-2 py-0.5 rounded-full text-xs font-medium">
              <ShoppingBag size={11} /> {t('recipes.storeBought')}
            </span>
          )}
          {!recipe.isStoreBought && (
            <span className="flex items-center gap-1 font-mono">
              <Clock size={14} /> {t('recipe.minutesFull', { n: recipe.timeMinutes })}
            </span>
          )}
          {recipe.servings > 0 && (
            <span className="flex items-center gap-1 font-mono">
              <Users size={14} /> {t('recipe.servesN', { count: recipe.servings })}
            </span>
          )}
        </div>
        {(recipe.healthScore != null || recipe.likeScore != null || recipe.mealLikeCount > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
            {recipe.healthScore != null && (
              <span className="flex items-center gap-1.5 text-xs text-ink/50">
                {t('recipe.healthLabel')} <ScorePicker kind="health" value={recipe.healthScore} readOnly size={14} />
              </span>
            )}
            {recipe.likeScore != null && (
              <span className="flex items-center gap-1.5 text-xs text-ink/50">
                {t('recipe.likeLabel')} <ScorePicker kind="like" value={recipe.likeScore} readOnly size={14} />
              </span>
            )}
            {/* 实际吃过之后的均分：来自每一顿单独打的分 */}
            {recipe.mealLikeCount > 0 && (
              <span className="text-xs text-ink/45">
                {t('recipe.actualLabel')} <b className="text-persimmon font-mono">{recipe.mealLikeAvg}</b>
                <span className="text-ink/30">{t('recipe.overMeals', { count: recipe.mealLikeCount })}</span>
              </span>
            )}
          </div>
        )}

        {recipe.tags?.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {recipe.tags.map((t) => (
              <span key={t} className="text-xs text-ink/40 bg-mist px-2 py-0.5 rounded-full">
                #{t}
              </span>
            ))}
          </div>
        )}

        {!recipe.isStoreBought && steps.length > 0 && (
          <button
            onClick={() => {
              setStepIndex(0);
              setCookingMode(true);
            }}
            className="w-full mt-4 py-3 rounded-lg bg-indigo text-porcelain font-medium"
          >
            {t('recipe.cookMode')}
          </button>
        )}

        <h3 className="font-display font-semibold mt-6 mb-2">
          {recipe.isStoreBought ? t('recipe.buyHowMuch') : t('recipe.ingredients')}
        </h3>
        <ul className="divide-y divide-mist border-y border-mist">
          {(recipe.ingredients || []).map((ing) => (
            <li key={ing.id} className="flex justify-between py-2 text-sm">
              <span>{ing.name}</span>
              <span className="font-mono text-ink/50">
                {ing.amount} {domainLabel(locale, 'unit', ing.unit)}
              </span>
            </li>
          ))}
          {(!recipe.ingredients || recipe.ingredients.length === 0) && (
            <li className="py-2 text-sm text-ink/30">{t('recipe.noIngredients')}</li>
          )}
        </ul>

        {!recipe.isStoreBought && steps.length > 0 && (
          <>
            <h3 className="font-display font-semibold mt-6 mb-2">{t('recipe.method')}</h3>
            <ol className="space-y-3">
              {steps.map((s, idx) => (
                <li key={s.id} className="flex gap-3">
                  <span className="font-mono text-wheat font-bold shrink-0">{idx + 1}</span>
                  <div className="min-w-0">
                    {s.title && <p className="font-medium text-sm">{s.title}</p>}
                    <p className="text-sm text-ink/70 leading-relaxed">{s.content}</p>
                    {s.photoURL && (
                      <img
                        src={s.photoURL}
                        alt={s.title || t('recipe.stepNAlt', { n: idx + 1 })}
                        loading="lazy"
                        className="mt-2 w-full max-w-xs rounded-lg border border-mist"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
