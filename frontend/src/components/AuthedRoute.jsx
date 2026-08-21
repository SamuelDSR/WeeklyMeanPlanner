import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import Nav from './Nav';

// 只要求"已登录"：不要求已加入家庭，也不要求是管理员。
// 「设置」这一页要给所有人看（家庭那一段没家庭时自己隐藏），
// 所以不能用 ProtectedRoute（它会把没家庭的人赶回登录页）。
export default function AuthedRoute() {
  const { t } = useI18n();
  const { user } = useAuth();

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-ink/40">{t('common.loading')}</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-porcelain">
      <Nav />
      <Outlet />
    </div>
  );
}
