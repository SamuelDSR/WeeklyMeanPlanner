import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Camera, Loader2, X, ShoppingBag, CircleDashed, CheckCircle2, GripVertical } from 'lucide-react';
import {
  saveRecipe,
  deleteRecipe,
  uploadRecipePhoto,
  fetchRecipe,
} from '../lib/familyData';
import PhotoUpload from '../components/PhotoUpload';
import { fetchUnitGroups } from '../lib/unitOptions';
import ScorePicker from '../components/ScorePicker';
import SortableList from '../components/SortableList';
import RecipeImportPanel from '../components/RecipeImportPanel';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';

// 这三组都是**数据库里的值**（recipes.category / menu_slots.meal_slot / ingredients.category），
// 只在显示时翻译，见 i18n/domain.js
const CATEGORY_OPTIONS = ['蔬菜', '水果', '肉类', '鱼类', '蛋奶豆制品', '主食', '汤羹'];
const MEAL_OPTIONS = ['午餐', '晚餐'];
const ING_CATEGORY_OPTIONS = ['蔬菜类', '水果类', '肉禽类', '水产类', '蛋奶类', '干货粮油', '调料', '其他'];

let idCounter = 0;
const nextId = () => `tmp_${Date.now()}_${idCounter++}`;

const emptyIngredient = () => ({ id: nextId(), name: '', amount: '', unit: '', category: '蔬菜类', isOptional: false });
const emptyStep = () => ({ id: nextId(), title: '', content: '', timerSeconds: '', photoURL: null, thumbURL: null });

export default function RecipeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const { t, locale } = useI18n();

  const [loaded, setLoaded] = useState(!isEditing);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [meals, setMeals] = useState(['晚餐']);
  const [timeMinutes, setTimeMinutes] = useState(30);
  const [servings, setServings] = useState(4);
  const [isStoreBought, setIsStoreBought] = useState(false);
  const [healthScore, setHealthScore] = useState(null);
  const [likeScore, setLikeScore] = useState(null);
  const [tags, setTags] = useState('');
  const [photoURL, setPhotoURL] = useState(null);
  const [thumbURL, setThumbURL] = useState(null);
  const [ingredients, setIngredients] = useState([emptyIngredient()]);
  const [steps, setSteps] = useState([emptyStep()]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [unitGroups, setUnitGroups] = useState([]);
  const [stepUploading, setStepUploading] = useState(null);

  // 编辑模式：打开时把服务器上的值读进来一次就够了。
  // 这里千万不能用轮询订阅 —— 每次刷新都会把还没保存的输入盖掉，
  // 尤其是刚上传的照片：选完文件回到页面会触发 focus 刷新，照片当场就没了。
  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;

    (async () => {
      try {
        const found = await fetchRecipe(id);
        if (cancelled) return;
        if (!found) {
          setLoadError(t('recipe.notFound'));
          return;
        }
        setName(found.name || '');
        setCategory(found.category || CATEGORY_OPTIONS[0]);
        setMeals(found.meals || []);
        setTimeMinutes(found.timeMinutes || 30);
        setServings(found.servings || 4);
        setIsStoreBought(!!found.isStoreBought);
        setHealthScore(found.healthScore ?? null);
        setLikeScore(found.likeScore ?? null);
        setTags((found.tags || []).join(','));
        setPhotoURL(found.photoURL || null);
        setThumbURL(found.thumbURL || null);
        setIngredients(
          found.ingredients?.length
            ? found.ingredients.map((i) => ({ ...i, isOptional: i.isOptional === true }))
            : [emptyIngredient()]
        );
        setSteps(found.steps?.length ? found.steps : [emptyStep()]);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || t('common.loadFailed'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditing, id]);

  // 单位下拉框的选项（静态列表，取一次就缓存住了）
  useEffect(() => {
    let cancelled = false;
    fetchUnitGroups()
      .then((groups) => {
        if (!cancelled) setUnitGroups(groups);
      })
      .catch(() => {
        // 取不到就退化成一个空下拉框，不影响填其它字段
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleMeal(m) {
    setMeals((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function updateIngredient(idx, patch) {
    setIngredients((prev) => prev.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)));
  }
  function updateStep(idx, patch) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const cleanIngredients = ingredients
        .filter((i) => i.name.trim())
        .map((i, idx) => ({
          ...i,
          amount: Number(i.amount) || 0,
          isOptional: i.isOptional === true,
          order: idx,
        }));
      const cleanSteps = steps
        .filter((s) => s.content.trim())
        .map((s, idx) => ({
          ...s,
          order: idx,
          timerSeconds: Number(s.timerSeconds) || 0,
        }));

      const data = {
        name: name.trim(),
        category,
        meals,
        timeMinutes: Number(timeMinutes) || 0,
        servings: Math.max(1, Number(servings) || 1),
        isStoreBought,
        healthScore,
        likeScore,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        photoURL,
        thumbURL,
        ingredients: cleanIngredients,
        steps: cleanSteps,
      };

      const savedId = await saveRecipe(isEditing ? id : null, data);
      navigate(`/recipes/${savedId}`);
    } finally {
      setSaving(false);
    }
  }

  // 给某一步上传配图，走的是和菜品照片同一个接口（同样会压成主图+缩略图）
  async function handleStepPhoto(idx, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setStepUploading(idx);
    try {
      const { photoURL: url, thumbURL: thumb } = await uploadRecipePhoto(file);
      updateStep(idx, { photoURL: url, thumbURL: thumb });
    } catch (err) {
      alert(err.message || t('recipe.photoUploadFailed'));
    } finally {
      setStepUploading(null);
      event.target.value = '';
    }
  }

  // 大模型解析出来的草稿灌进表单。**只填不存** —— 用户过一遍再自己按保存。
  // 每行都要重新发一个本地 id，React 的 key 和拖动排序都靠它。
  function applyDraft(draft) {
    if (!draft) return;
    setName(draft.name || '');
    if (draft.category) setCategory(draft.category);
    if (draft.meals?.length) setMeals(draft.meals);
    if (draft.timeMinutes != null) setTimeMinutes(draft.timeMinutes);
    if (draft.servings != null) setServings(draft.servings);
    if (draft.tags?.length) setTags(draft.tags.join(','));
    setIsStoreBought(false); // 解析出来的都是要自己做的菜
    setIngredients(
      draft.ingredients?.length
        ? draft.ingredients.map((i) => ({ ...i, id: nextId(), amount: String(i.amount ?? '') }))
        : [emptyIngredient()]
    );
    setSteps(
      draft.steps?.length
        ? draft.steps.map((st) => ({
            ...st,
            id: nextId(),
            timerSeconds: st.timerSeconds ? String(st.timerSeconds) : '',
            photoURL: null,
            thumbURL: null,
          }))
        : [emptyStep()]
    );
  }

  async function handlePhotoUpload(file) {
    const { photoURL: url, thumbURL: thumb } = await uploadRecipePhoto(file);
    setPhotoURL(url);
    setThumbURL(thumb);
  }

  async function handleDelete() {
    if (!confirm(t('recipe.deleteConfirm', { name }))) return;
    await deleteRecipe(id);
    navigate('/recipes');
  }

  // 推荐列表里已有的单位，用来判断某个单位要不要额外补一个 option
  const knownUnits = useMemo(
    () => new Set(unitGroups.flatMap((g) => g.units)),
    [unitGroups]
  );

  if (loadError) return <div className="p-6 text-center text-persimmon">{loadError}</div>;
  if (!loaded) return <div className="p-6 text-center text-ink/40">{t('common.loading')}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-ink/50 text-sm mb-3">
        <ArrowLeft size={16} /> {t('common.back')}
      </button>
      <h2 className="font-display font-bold text-xl mb-4">{isEditing ? t('recipe.editTitle') : t('recipe.newTitle')}</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 手工录菜谱挺费劲的：贴一段文字或一个网址，让模型先填一遍。
            只在新建时给：编辑已有菜谱时一键覆盖太容易误伤。 */}
        {!isEditing && <RecipeImportPanel onFill={applyDraft} />}

        <PhotoUpload photoURL={photoURL} onUpload={handlePhotoUpload} onRemove={() => {
            setPhotoURL(null);
            setThumbURL(null);
          }} />

        <div>
          <label className="text-sm text-ink/60 block mb-1">{t('recipe.name')}</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('recipe.namePlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-mist bg-white focus:border-indigo outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-ink/60 block mb-1">{t('recipe.category')}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {domainLabel(locale, 'recipeCategory', c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-ink/60 block mb-1">{t('recipe.timeMinutes')}</label>
            <input
              type="number"
              min="0"
              value={timeMinutes}
              onChange={(e) => setTimeMinutes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none font-mono"
            />
          </div>
        </div>

        {/* 买现成的：熟食、冷冻披萨、超市烤鸡这种，不用做，直接买 */}
        <label className="flex items-start gap-2 bg-white border border-mist rounded-lg p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isStoreBought}
            onChange={(e) => setIsStoreBought(e.target.checked)}
            className="mt-0.5 accent-indigo"
          />
          <span>
            <span className="text-sm font-medium flex items-center gap-1">
              <ShoppingBag size={14} className="text-wheat" /> {t('recipe.storeBoughtLabel')}
            </span>
            <span className="text-xs text-ink/45 block mt-0.5">
              {t('recipe.storeBoughtHint')}
            </span>
          </span>
        </label>

        <div>
          <label className="text-sm text-ink/60 block mb-1">
            {isStoreBought ? t('recipe.servingsBuy') : t('recipe.servingsCook')}
          </label>
          <input
            type="number"
            min="1"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg border border-mist bg-white outline-none font-mono"
          />
          <p className="text-xs text-ink/40 mt-1">
            {t('recipe.servingsHint')}
          </p>
        </div>

        {/* 健康分和喜好分是两件独立的事：健康的菜不一定爱吃，爱吃的不一定健康。
            健康分是这道菜本身的属性；喜好分这里填的是默认值，具体某一顿可以在「历史」页单独评。 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-ink/60 block mb-1.5">{t('recipe.health')}</label>
            <ScorePicker kind="health" value={healthScore} onChange={setHealthScore} />
          </div>
          <div>
            <label className="text-sm text-ink/60 block mb-1.5">{t('recipe.likeDefault')}</label>
            <ScorePicker kind="like" value={likeScore} onChange={setLikeScore} />
            <p className="text-[11px] text-ink/35 mt-1">{t('recipe.likeDefaultHint')}</p>
          </div>
        </div>

        <div>
          <label className="text-sm text-ink/60 block mb-1">{t('recipe.meals')}</label>
          <div className="flex gap-2">
            {MEAL_OPTIONS.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => toggleMeal(m)}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  meals.includes(m) ? 'bg-wheat text-white border-wheat' : 'border-mist text-ink/50'
                }`}
              >
                {domainLabel(locale, 'meal', m)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-ink/60 block mb-1">{t('recipe.tags')}</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t('recipe.tagsPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none"
          />
        </div>

        {/* 买现成的只要一行「一份买多少」；要自己做的才有食材和做法 */}
        {isStoreBought ? (
        <div>
          <label className="text-sm text-ink/60 block mb-1">{t('recipe.purchaseAmount')}</label>
          <div className="flex gap-1.5 items-center">
            <input
              placeholder={t('recipe.amount')}
              type="number"
              min="0"
              step="any"
              value={ingredients[0]?.amount ?? ''}
              onChange={(e) => updateIngredient(0, { amount: e.target.value })}
              className="w-20 px-2 py-2 rounded-md border border-mist bg-white text-sm font-mono outline-none"
            />
            <select
              value={ingredients[0]?.unit ?? ''}
              onChange={(e) => updateIngredient(0, { unit: e.target.value })}
              className="w-24 px-1 py-2 rounded-md border border-mist bg-white text-sm outline-none"
            >
              <option value="">{t('recipe.unit')}</option>
              {ingredients[0]?.unit && !knownUnits.has(ingredients[0].unit) && (
                <option value={ingredients[0].unit}>{domainLabel(locale, 'unit', ingredients[0].unit)}</option>
              )}
              {unitGroups.map((g) => (
                <optgroup key={g.group} label={domainLabel(locale, 'unitGroup', g.group)}>
                  {g.units.map((u) => (
                    <option key={u} value={u}>
                      {domainLabel(locale, 'unit', u)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select
              value={ingredients[0]?.category ?? '其他'}
              onChange={(e) => updateIngredient(0, { category: e.target.value })}
              className="flex-1 min-w-0 px-1 py-2 rounded-md border border-mist bg-white text-xs outline-none"
            >
              {ING_CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {domainLabel(locale, 'ingredientCategory', c)}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-ink/40 mt-1.5">
            {t('recipe.purchaseHint')}
          </p>
        </div>
        ) : (
          <>
          {/* 食材列表 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-ink/60">{t('recipe.ingredients')}</label>
              <button
                type="button"
                onClick={() => setIngredients((p) => [...p, emptyIngredient()])}
                className="text-xs text-indigo flex items-center gap-0.5"
              >
                <Plus size={14} /> {t('recipe.addRow')}
              </button>
            </div>
            <p className="text-[11px] text-ink/35 mb-1.5 flex items-center gap-1">
              <CircleDashed size={11} className="text-wheat" /> {t('recipe.optionalHint')}
            </p>
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div
                  key={ing.id}
                  className={`flex gap-1.5 items-center ${ing.isOptional ? 'opacity-70' : ''}`}
                >
                  {/* 可选食材：香菜、辣椒这种，有更好、没有也能做。
                      购物清单里会单独成行标出来，不混进必买的量。 */}
                  <button
                    type="button"
                    onClick={() => updateIngredient(idx, { isOptional: !ing.isOptional })}
                    title={ing.isOptional ? t('recipe.optionalOn') : t('recipe.optionalOff')}
                    aria-pressed={!!ing.isOptional}
                    className={`shrink-0 p-1 ${ing.isOptional ? 'text-wheat' : 'text-ink/20'}`}
                  >
                    {ing.isOptional ? <CircleDashed size={16} /> : <CheckCircle2 size={16} />}
                  </button>
                  <input
                    placeholder={t('recipe.ingredientName')}
                    value={ing.name}
                    onChange={(e) => updateIngredient(idx, { name: e.target.value })}
                    className="flex-[2] min-w-0 px-2 py-1.5 rounded-md border border-mist bg-white text-sm outline-none"
                  />
                  <input
                    placeholder={t('recipe.amount')}
                    type="number"
                    value={ing.amount}
                    onChange={(e) => updateIngredient(idx, { amount: e.target.value })}
                    className="w-14 px-2 py-1.5 rounded-md border border-mist bg-white text-sm font-mono outline-none"
                  />
                  <select
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, { unit: e.target.value })}
                    className="w-20 px-1 py-1.5 rounded-md border border-mist bg-white text-xs outline-none"
                  >
                    <option value="">{t('recipe.unit')}</option>
                    {/* 老菜谱里手打的单位可能不在推荐列表里：单独补一个选项，
                        免得一打开编辑页这个单位就被悄悄清掉 */}
                    {ing.unit && !knownUnits.has(ing.unit) && (
                      <option value={ing.unit}>{domainLabel(locale, 'unit', ing.unit)}</option>
                    )}
                    {unitGroups.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.units.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <select
                    value={ing.category}
                    onChange={(e) => updateIngredient(idx, { category: e.target.value })}
                    className="flex-1 min-w-0 px-1 py-1.5 rounded-md border border-mist bg-white text-xs outline-none"
                  >
                    {ING_CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIngredients((p) => p.filter((_, i) => i !== idx))}
                    className="text-ink/30 shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 做法步骤 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-ink/60">{t('recipe.steps')}</label>
              <button
                type="button"
                onClick={() => setSteps((p) => [...p, emptyStep()])}
                className="text-xs text-indigo flex items-center gap-0.5"
              >
                <Plus size={14} /> {t('recipe.addStep')}
              </button>
            </div>
            {/* 能拖这件事得明说一句，不然没人会想到去试 */}
            {steps.length > 1 && (
              <p className="text-[11px] text-ink/40 mb-1.5 flex items-center gap-1">
                <GripVertical size={11} /> {t('recipe.reorderHint')}
              </p>
            )}
            {/* 步骤可以拖着换顺序（手机上也能拖），旁边还有上/下箭头兜底 */}
            <SortableList
              items={steps}
              onReorder={setSteps}
              renderItem={(s, idx) => (
                <div className="border border-mist rounded-lg p-2.5 bg-white">
                  <div className="flex gap-2 mb-1.5">
                    <span className="font-mono text-xs text-wheat font-bold pt-2">{idx + 1}</span>
                    <input
                      placeholder={t('recipe.stepTitlePlaceholder')}
                      value={s.title}
                      onChange={(e) => updateStep(idx, { title: e.target.value })}
                      className="flex-1 px-2 py-1.5 rounded-md border border-mist text-sm outline-none"
                    />
                    <input
                      placeholder={t('recipe.stepTimer')}
                      type="number"
                      value={s.timerSeconds}
                      onChange={(e) => updateStep(idx, { timerSeconds: e.target.value })}
                      className="w-20 px-2 py-1.5 rounded-md border border-mist text-sm font-mono outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSteps((p) => p.filter((_, i) => i !== idx))}
                      className="text-ink/30 shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <textarea
                    placeholder={t('recipe.stepContent')}
                    value={s.content}
                    onChange={(e) => updateStep(idx, { content: e.target.value })}
                    rows={2}
                    className="w-full px-2 py-1.5 rounded-md border border-mist text-sm outline-none resize-none"
                  />
                  {/* 这一步的配图（可选） */}
                  <div className="mt-2">
                    {s.photoURL ? (
                      <div className="relative w-28">
                        <img
                          src={s.thumbURL || s.photoURL}
                          alt=""
                          loading="lazy"
                          className="w-28 h-20 object-cover rounded-md border border-mist"
                        />
                        <button
                          type="button"
                          onClick={() => updateStep(idx, { photoURL: null, thumbURL: null })}
                          className="absolute -top-1.5 -right-1.5 bg-ink/60 text-porcelain rounded-full p-0.5"
                          aria-label={t('recipe.removePhoto')}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-1 text-xs text-indigo cursor-pointer">
                        {stepUploading === idx ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Camera size={13} />
                        )}
                        {stepUploading === idx ? t('recipe.uploading') : t('recipe.addStepPhoto')}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleStepPhoto(idx, e)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            />
          </div>

          </>
        )}

        <div className="flex gap-3 pt-2">
          <button
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-indigo text-porcelain font-medium disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2.5 rounded-lg border border-persimmon text-persimmon font-medium"
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
