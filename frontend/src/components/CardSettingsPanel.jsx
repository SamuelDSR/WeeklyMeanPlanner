import { useEffect, useState } from 'react';
import { CreditCard, RotateCw } from 'lucide-react';
import { fetchCards, reorderCards } from '../lib/cardData';
import { cardLandscape } from '../lib/devicePrefs';
import SortableList from './SortableList';
import { useI18n } from '../i18n';

// 卡包设置：卡片顺序（全家共享）+ 是否自动横屏（只跟这台设备）。
//
// 顺序值得单独放一个设置：常去的超市卡应该排在最前面，
// 结账时少划一下就是少几秒钟。
export default function CardSettingsPanel() {
  const { t } = useI18n();
  const [cards, setCards] = useState(null);
  const [landscape, setLandscape] = useState(cardLandscape.get);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCards()
      .then((list) => {
        if (!cancelled) setCards(list);
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 拖完立刻存：这里没有「保存」按钮，拖动本身就是操作
  async function handleReorder(next) {
    setCards(next);
    setError('');
    setSaving(true);
    try {
      await reorderCards(next.map((c) => c.id));
    } catch (e) {
      setError(e.message || t('common.saveFailed'));
      // 存失败就把服务器上的真实顺序读回来，别让界面骗人
      setCards(await fetchCards().catch(() => next));
    } finally {
      setSaving(false);
    }
  }

  function toggleLandscape() {
    const next = !landscape;
    setLandscape(next);
    cardLandscape.set(next);
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-3.5 space-y-3">
      <div>
        <h4 className="font-display font-semibold flex items-center gap-2 mb-1">
          <RotateCw size={16} className="text-indigo" /> {t('cardSettings.landscapeTitle')}
        </h4>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={landscape}
            onChange={toggleLandscape}
            className="mt-0.5 accent-indigo"
          />
          <span className="text-sm">
            {t('cardSettings.landscapeLabel')}
            <span className="block text-xs text-ink/45 mt-0.5">
              {t('cardSettings.landscapeHint')}
            </span>
          </span>
        </label>
      </div>

      <div className="pt-3 border-t border-mist">
        <h4 className="font-display font-semibold flex items-center gap-2 mb-1">
          <CreditCard size={16} className="text-indigo" /> {t('cardSettings.orderTitle')}
        </h4>
        <p className="text-xs text-ink/45 leading-relaxed mb-2">
          {t('cardSettings.orderHint')}
        </p>
        {error && <p className="text-persimmon text-sm mb-2">{error}</p>}

        {cards === null ? (
          <p className="text-sm text-ink/35">{t('common.loading')}</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-ink/35">{t('cardSettings.noCards')}</p>
        ) : (
          <SortableList
            items={cards}
            onReorder={handleReorder}
            renderItem={(card, idx) => (
              <div className="flex items-center gap-2 py-1.5">
                <span className="font-mono text-xs text-ink/30 w-4 shrink-0">{idx + 1}</span>
                <span className="text-sm truncate flex-1">{card.name}</span>
                <span className="font-mono text-[10px] text-ink/35 shrink-0">
                  {card.codeFormat}
                </span>
              </div>
            )}
          />
        )}
        {saving && <p className="text-[11px] text-ink/35 mt-1">{t('common.saving')}</p>}
      </div>
    </div>
  );
}
