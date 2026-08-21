import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wand2, ShoppingBasket, History, Lock } from 'lucide-react';
import {
  subscribeRecipes,
  subscribeWeeklyMenu,
  generateWeeklyMenu,
  updateMenuSlot,
  setSlotEatOut,
  confirmMenu,
  unconfirmMenu,
  fetchWeeklyMenu,
  generateShoppingList,
} from '../lib/familyData';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import MenuDayCard from '../components/MenuDayCard';
import MealPlanSummary from '../components/MealPlanSummary';
import WeekTabs from '../components/WeekTabs';

export default function WeeklyMenu() {
  const { family, updateMemberCount } = useAuth();
  const { t } = useI18n();
  const [recipes, setRecipes] = useState([]);
  const [menu, setMenu] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  // 每次本地改动 +1。轮询会比对这个版本号，避免旧数据覆盖刚做的改动（见 lib/poll.js）
  const localVersion = useRef(0);
  const bumpVersion = () => (localVersion.current += 1);
  // 本周 / 下一周：两周都能改，本周随时调整，下一周提前排
  const [week, setWeek] = useState('current');

  useEffect(() => {
    const u1 = subscribeRecipes(setRecipes);
    return u1;
  }, []);

  // 切周就换一个订阅；先清空避免短暂显示上一周的内容
  useEffect(() => {
    setMenu(undefined);
    bumpVersion();
    return subscribeWeeklyMenu(week, setMenu, { getVersion: () => localVersion.current });
  }, [week]);

  async function handleGenerate() {
    bumpVersion();
    setBusy(true);
    setNotice('');
    try {
      // 只补空格子：已经排好的菜、「出去吃」的标记、那一顿的评分都不会被动
      const { menu: newMenu, addedCount } = await generateWeeklyMenu(week);
      setMenu(newMenu);
      setNotice(
        addedCount > 0 ? t('menu.filled', { count: addedCount }) : t('menu.nothingToFill')
      );
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnconfirm() {
    if (!window.confirm(t('menu.unconfirmWarn'))) return;
    bumpVersion();
    setBusy(true);
    setNotice('');
    try {
      await unconfirmMenu(week);
      setMenu(await fetchWeeklyMenu(week));
      setNotice(t('menu.unconfirmed'));
    } catch (err) {
      setNotice(err.message || t('common.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeSlot(date, meal, recipeIds) {
    bumpVersion();
    // 先乐观更新，界面不等网络
    setMenu((prev) => ({
      ...prev,
      days: prev.days.map((d) => (d.date === date ? { ...d, [meal]: recipeIds } : d)),
    }));
    try {
      await updateMenuSlot(date, meal, recipeIds);
      // 「要做几份」是服务端算的，本地没法凭空更新，所以改完重新拉一次
      setMenu(await fetchWeeklyMenu(week));
    } catch (e) {
      setNotice(t('common.saveFailed'));
    }
  }

  async function handleToggleEatOut(date, meal, eatOut) {
    bumpVersion();
    setMenu((prev) => ({
      ...prev,
      days: prev.days.map((d) =>
        d.date === date
          ? {
              ...d,
              [meal]: [],
              eatOut: eatOut
                ? [...(d.eatOut || []), meal]
                : (d.eatOut || []).filter((m) => m !== meal),
            }
          : d
      ),
    }));
    try {
      await setSlotEatOut(date, meal, eatOut);
      setMenu(await fetchWeeklyMenu(week));
    } catch (e) {
      setNotice(t('common.saveFailed'));
    }
  }

  async function handleConfirm() {
    bumpVersion();
    setBusy(true);
    setNotice('');
    try {
      const { dishCount } = await confirmMenu(week);
      setMenu(await fetchWeeklyMenu(week));
      setNotice(t('menu.confirmedNotice', { count: dishCount }));
    } catch (err) {
      setNotice(err.message || t('common.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeMemberCount(count) {
    bumpVersion();
    await updateMemberCount(count);
    setMenu(await fetchWeeklyMenu(week));
  }

  async function handleGenerateShoppingList() {
    if (!menu?.days) return;
    try {
      const { missingDishNames } = await generateShoppingList(week);
      setNotice(
        missingDishNames?.length > 0
          ? t('menu.shoppingMissing', { names: missingDishNames.join('、') })
          : t('menu.shoppingDone')
      );
    } catch (e) {
      setNotice(e.message);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display font-bold text-xl">{t('menu.title')}</h2>
        <Link to="/history" className="text-sm text-indigo flex items-center gap-1">
          <History size={15} /> {t('menu.history')}
        </Link>
      </div>
      <WeekTabs week={week} onChange={setWeek} weekStart={menu?.weekStart} />

      <div className="flex gap-2 mb-4">
        <button
          onClick={handleGenerate}
          disabled={busy || recipes.length === 0 || !!menu?.confirmedAt}
          title={menu?.confirmedAt ? t('menu.autoFillLocked') : t('menu.autoFillTip')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-indigo text-porcelain font-medium disabled:opacity-50"
        >
          <Wand2 size={16} /> {busy ? t('menu.autoFilling') : t('menu.autoFill')}
        </button>
        <button
          onClick={handleGenerateShoppingList}
          disabled={!menu?.days}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-persimmon text-persimmon font-medium disabled:opacity-30"
        >
          <ShoppingBasket size={16} />
        </button>
      </div>

      {notice && (
        <p className="text-sm bg-wheat/15 text-ink/70 rounded-lg px-3 py-2 mb-4">{notice}</p>
      )}

      {recipes.length === 0 && (
        <p className="text-center text-ink/40 text-sm mt-8">
          {t('menu.emptyLibrary')}
          <Link to="/recipes/new" className="text-indigo underline ml-1">
            {t('nav.recipes')}
          </Link>
        </p>
      )}

      {menu?.days && (
        <>
          <MealPlanSummary
            plan={menu.plan}
            memberCount={menu.memberCount ?? family?.memberCount}
            onChangeMemberCount={handleChangeMemberCount}
          />

          {menu.confirmedAt ? (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <span className="flex-1 flex items-center gap-1.5 text-ink/50">
                <Lock size={14} /> {t('menu.confirmed')}
              </span>
              <button
                onClick={handleUnconfirm}
                disabled={busy}
                className="text-ink/50 border border-mist rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {t('menu.unconfirm')}
              </button>
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="w-full mb-4 py-2.5 rounded-lg font-medium border border-indigo text-indigo disabled:opacity-50"
            >
              {t('menu.confirm')}
            </button>
          )}

          <div className="space-y-3">
            {menu.days.map((day) => (
              <MenuDayCard
                key={day.date}
                day={day}
                recipes={recipes}
                onChangeSlot={handleChangeSlot}
                onToggleEatOut={handleToggleEatOut}
              />
            ))}
          </div>
        </>
      )}

    </div>
  );
}
