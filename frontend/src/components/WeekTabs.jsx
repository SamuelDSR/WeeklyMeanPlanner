import { useI18n } from '../i18n';

// 本周 / 下一周 切换。
// 两周同时都是"活的"：本周还能改（今天之后的饭随时能换），下一周可以提前排。
// 具体是哪个周一由服务端按家庭时区算，前端只传 current / next。
export default function WeekTabs({ week, onChange, weekStart }) {
  const { t, formatDate } = useI18n();

  return (
    <div className="mb-3">
      <div className="flex rounded-lg overflow-hidden border border-mist">
        {['current', 'next'].map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            className={`flex-1 py-2 text-sm font-medium ${
              week === w ? 'bg-indigo text-porcelain' : 'bg-porcelain text-ink/60'
            }`}
          >
            {t(w === 'current' ? 'week.current' : 'week.next')}
          </button>
        ))}
      </div>
      {weekStart && (
        <p className="text-xs text-ink/40 mt-1.5 text-center">
          {t('menu.weekFrom', { date: formatDate(weekStart) })}
        </p>
      )}
    </div>
  );
}
