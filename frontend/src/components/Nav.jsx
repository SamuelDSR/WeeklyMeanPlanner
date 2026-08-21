import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarDays, ShoppingBasket, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

// 「设置」对所有人可见：里面的家庭管理、用户审核会按权限自己决定显示不显示
const LINKS = [
  { to: '/menu', labelKey: 'nav.menu', icon: CalendarDays },
  { to: '/recipes', labelKey: 'nav.recipes', icon: BookOpen },
  { to: '/shopping', labelKey: 'nav.shopping', icon: ShoppingBasket },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export default function Nav() {
  const { family } = useAuth();
  const { t } = useI18n();

  return (
    <>
      {/* 顶部：只显示家庭名。设置、退出登录都在「设置」那个 tab 里 */}
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
          {LINKS.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-indigo' : 'text-ink/40'
                }`
              }
            >
              <Icon size={22} strokeWidth={2} />
              {t(labelKey)}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
