import { NavLink, useLocation } from 'react-router-dom';
import { UtensilsCrossed, Wallet, CreditCard, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

// 底部四个 tab。
//
// 「吃饭」把本周菜单 / 菜谱库 / 购物清单三个页面收在一起（见 EatTabs 的二级切换），
// 否则六个功能塞进底栏，每个只剩 65px 宽，图标和文字都挤成一团。
const LINKS = [
  // 吃饭点进去落在本周菜单；下面 match 里列出属于这一组的所有路径
  { to: '/menu', labelKey: 'nav.eat', icon: UtensilsCrossed,
    match: ['/menu', '/recipes', '/shopping', '/history'] },
  { to: '/ledger', labelKey: 'nav.ledger', icon: Wallet, match: ['/ledger'] },
  { to: '/cards', labelKey: 'nav.cards', icon: CreditCard, match: ['/cards'] },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, match: ['/settings'] },
];

export default function Nav() {
  const { family } = useAuth();
  const { t } = useI18n();
  const { pathname } = useLocation();

  return (
    <>
      {/* 顶部：只显示家庭名 */}
      <header className="border-b border-mist bg-porcelain/95 backdrop-blur sticky top-0 z-10 pt-safe">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <h1 className="font-display font-bold text-lg text-indigo tracking-wide">
            {family?.name ? `${family.name} · ${t('nav.appName')}` : t('nav.appName')}
          </h1>
        </div>
      </header>

      {/* 底部导航：适配手机拇指操作 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-porcelain border-t border-mist z-10 pb-safe">
        <div className="max-w-3xl mx-auto grid grid-cols-4">
          {LINKS.map(({ to, labelKey, icon: Icon, match }) => {
            // 用前缀判断而不是 NavLink 自带的 isActive：
            // 「吃饭」这一组底下有好几个路径，菜谱详情页也该让它保持高亮
            const active = match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
            return (
              <NavLink
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                  active ? 'text-indigo' : 'text-ink/40'
                }`}
              >
                <Icon size={22} strokeWidth={2} />
                {t(labelKey)}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
