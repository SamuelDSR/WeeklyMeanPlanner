import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeShoppingList, toggleShoppingItem } from '../lib/familyData';
import { queueOfflineToggle, flushOfflineQueue } from '../lib/offlineQueue';
import { useI18n } from '../i18n';
import WeekTabs from '../components/WeekTabs';
import { domainLabel } from '../i18n/domain';

export default function ShoppingList() {
  const { t, locale } = useI18n();
  const [list, setList] = useState(undefined);
  // 勾选是乐观更新，别让轮询的旧数据把它覆盖回去（见 lib/poll.js）
  const localVersion = useRef(0);
  // 和菜单页一致：本周 / 下一周分别有自己的购物清单
  const [week, setWeek] = useState('current');

  useEffect(() => {
    const onOnline = () => flushOfflineQueue();
    window.addEventListener('online', onOnline);
    flushOfflineQueue(); // 打开页面时如果之前离线攒了操作，先尝试补发一次
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // 切周就换一个订阅；先清空，避免短暂显示上一周的清单
  useEffect(() => {
    setList(undefined);
    localVersion.current += 1;
    return subscribeShoppingList(week, setList, { getVersion: () => localVersion.current });
  }, [week]);

  const grouped = useMemo(() => {
    if (!list?.items) return [];
    const map = new Map();
    list.items.forEach((item) => {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category).push(item);
    });
    return Array.from(map.entries());
  }, [list]);

  async function handleToggle(itemId) {
    localVersion.current += 1;
    // 乐观更新：先改本地界面，不等网络请求回来，做饭/购物时手感更快
    const optimistic = list.items.map((it) =>
      it.id === itemId ? { ...it, checked: !it.checked } : it
    );
    setList({ ...list, items: optimistic });

    try {
      await toggleShoppingItem(itemId);
    } catch (e) {
      // 离线或请求失败：把这次操作记下来，联网后自动补发，界面上先保留乐观更新的样子
      queueOfflineToggle(itemId);
    }
  }

  const items = list?.items ?? [];
  const boughtCount = items.filter((i) => i.checked).length;

  // 标题和「本周/下一周」切换条永远渲染：
  // 不然某一周没有清单时会整页只剩一句提示，切都切不回去
  const header = (
    <>
      <h2 className="font-display font-bold text-xl mb-1">{t('shopping.title')}</h2>
      <WeekTabs week={week} onChange={setWeek} weekStart={list?.weekStart} />
    </>
  );

  if (list === undefined) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
        {header}
        <p className="text-center text-ink/40 text-sm mt-6">{t('common.loading')}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
        {header}
        <p className="text-center text-ink/40 text-sm mt-6">{t('shopping.empty')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
      {header}
      <p className="text-xs text-ink/40 font-mono mb-4">
        {t('shopping.progress', { done: boughtCount, total: items.length })}
      </p>

      {/* 小票卡片 */}
      <div
        className="bg-white shadow-card mx-auto"
        style={{
          maxWidth: 420,
          backgroundImage:
            'repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(34,48,43,0.02) 3px, rgba(34,48,43,0.02) 6px)',
        }}
      >
        <div className="border-b-2 border-dashed border-mist py-3 text-center">
          <p className="font-display font-bold tracking-widest text-ink/70">{t('shopping.listHeader')}</p>
        </div>

        <div className="px-4 py-2">
          {grouped.map(([category, items]) => (
            <div key={category} className="py-2">
              <p className="text-xs font-bold text-wheat tracking-wide mb-1">
                {domainLabel(locale, 'ingredientCategory', category)}
              </p>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleToggle(item.id)}
                  className="w-full flex items-baseline gap-2 py-2.5 text-left relative group"
                >
                  <span
                    className={`text-sm flex-shrink-0 ${
                      item.checked ? 'text-ink/30 line-through' : 'text-ink'
                    }`}
                  >
                    {item.name}
                  </span>
                  <span className="flex-1 border-b border-dotted border-mist translate-y-[-3px]" />
                  <span
                    className={`font-mono text-sm shrink-0 ${
                      item.checked ? 'text-ink/30 line-through' : 'text-ink/70'
                    }`}
                  >
                    {/* 适量/少许 这种没有数量，别显示成 "0 适量" */}
                    {item.qty > 0
                      ? `${item.qty} ${domainLabel(locale, 'unit', item.unit)}`
                      : domainLabel(locale, 'unit', item.unit)}
                  </span>

                  {item.checked && (
                    <span
                      className="absolute right-0 -top-1 font-display font-black text-persimmon text-xs border-2 border-persimmon rounded px-1.5 py-0.5 animate-stamp select-none"
                      style={{ transform: 'rotate(-10deg)' }}
                    >
                      {t('shopping.bought')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="border-t-2 border-dashed border-mist py-3 text-center">
          <p className="text-[11px] text-ink/30 font-mono">{t('shopping.footer')}</p>
        </div>
      </div>
    </div>
  );
}
