import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeShoppingList, setShoppingItemChecked } from '../lib/familyData';
import { enqueue, flushQueue } from '../lib/syncQueue';
import { useI18n } from '../i18n';
import EatTabs from '../components/EatTabs';
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
    const onOnline = () => flushQueue();
    window.addEventListener('online', onOnline);
    flushQueue(); // 打开页面时如果之前离线攒了操作，先尝试补发一次
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
    const target = !list.items.find((it) => it.id === itemId)?.checked;
    // 乐观更新：先改本地界面，不等网络请求回来，购物时手感更快
    setList({
      ...list,
      items: list.items.map((it) => (it.id === itemId ? { ...it, checked: target } : it)),
    });

    try {
      await setShoppingItemChecked(itemId, target);
    } catch {
      // 离线：记下**目标状态**而不是「翻转」。翻转不是幂等的 ——
      // 请求其实到了、只是响应丢了的话，补发一次就又翻回去了。
      enqueue('shopping.setChecked', { itemId, checked: target });
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
      <EatTabs />
        {header}
        <p className="text-center text-ink/40 text-sm mt-6">{t('common.loading')}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
      <EatTabs />
        {header}
        <p className="text-center text-ink/40 text-sm mt-6">{t('shopping.empty')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav">
      <EatTabs />
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
                      item.checked
                        ? 'text-ink/30 line-through'
                        : item.isOptional
                          ? 'text-ink/55'
                          : 'text-ink'
                    }`}
                  >
                    {item.name}
                    {/* 可选的单独成行（"土豆 1000 g" 和 "土豆 200 g 可选" 分开勾），
                        买不买在超市自己定 */}
                    {item.isOptional && (
                      <span className="ml-1.5 text-[10px] text-wheat border border-wheat/40 rounded px-1 align-middle">
                        {t('shopping.optional')}
                      </span>
                    )}
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
