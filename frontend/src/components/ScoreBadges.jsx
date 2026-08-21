import { Leaf, Heart } from 'lucide-react';
import { useI18n } from '../i18n';

// 紧凑的分数显示：图标 + 数字。
// 卡片、列表这种一行只有一百多像素的地方，画 5 个图标放不下也看不清，直接给数字。
// 详情页和历史页里"要动手改"的地方仍然用 ScorePicker（5 个可点的图标）。
export default function ScoreBadges({
  healthScore,
  likeScore,
  // 这个喜好分是"真吃过的均分"还是"菜谱上的默认值"。
  // 数字本身分不出来（实际均分刚好 4.0 会显示成 4，和默认 4 长得一样），
  // 所以差别放在 title 里，想知道细节点进详情页看。
  likeMealCount = 0,
  size = 11,
  className = '',
}) {
  const { t } = useI18n();
  if (healthScore == null && likeScore == null) return null;
  const likeTitle =
    likeMealCount > 0
      ? t('recipes.likeTitleActual', { n: likeScore, count: likeMealCount })
      : t('recipes.likeTitle', { n: likeScore });

  return (
    <span className={`flex items-center gap-2.5 text-[11px] text-ink/45 ${className}`}>
      {healthScore != null && (
        <span className="flex items-center gap-0.5" title={t('recipes.healthTitle', { n: healthScore })}>
          <Leaf size={size} className="text-matcha" fill="currentColor" />
          {healthScore}
        </span>
      )}
      {likeScore != null && (
        <span className="flex items-center gap-0.5" title={likeTitle}>
          <Heart size={size} className="text-persimmon" fill="currentColor" />
          {likeScore}
        </span>
      )}
    </span>
  );
}
