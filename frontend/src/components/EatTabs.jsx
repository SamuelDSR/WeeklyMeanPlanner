import { NavLink } from 'react-router-dom';
import { CalendarDays, BookOpen, ShoppingBasket } from 'lucide-react';
import { useI18n } from '../i18n';

// 「吃饭」下面的二级切换：本周菜单 / 菜谱库 / 购物清单。
// 这三件事是一条流水线（有什么菜 -> 排这周吃什么 -> 该买什么），放在一组里。
const TABS = [
  { to: '/menu', labelKey: 'nav.menu', icon: CalendarDays },
  { to: '/recipes', labelKey: 'nav.recipes', icon: BookOpen },
  { to: '/shopping', labelKey: 'nav.shopping', icon: ShoppingBasket },
];

export default function EatTabs() {
  const { t } = useI18n();
  return (
    <div className="flex gap-1 mb-3 bg-mist/60 rounded-lg p-1">
      {TABS.map(({ to, labelKey, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            `flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs font-medium transition-colors ${
              isActive ? 'bg-white text-indigo shadow-sm' : 'text-ink/50'
            }`
          }
        >
          <Icon size={14} /> {t(labelKey)}
        </NavLink>
      ))}
    </div>
  );
}
