import {
  Utensils, Carrot, PackageOpen, ShoppingBag, Shirt, Bus, Home, Sofa,
  Clapperboard, Bike, Smartphone, HeartPulse, Baby, Users, Gift, Plane,
  GraduationCap, CircleEllipsis, Wallet, Award, Briefcase, TrendingUp,
  Receipt, Undo2,
} from 'lucide-react';

// 分类图标。后端只给图标名（见 server/src/expenseCategories.js），
// 这里查表 —— 不能按名字动态取，打包工具会把整个图标库都留下。
const ICONS = {
  Utensils, Carrot, PackageOpen, ShoppingBag, Shirt, Bus, Home, Sofa,
  Clapperboard, Bike, Smartphone, HeartPulse, Baby, Users, Gift, Plane,
  GraduationCap, CircleEllipsis, Wallet, Award, Briefcase, TrendingUp,
  Receipt, Undo2,
};

export default function CategoryIcon({ name, size = 20, className = '' }) {
  const Icon = ICONS[name] || CircleEllipsis;
  return <Icon size={size} className={className} />;
}
