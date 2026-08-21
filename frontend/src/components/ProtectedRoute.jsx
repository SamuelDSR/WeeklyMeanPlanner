import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import Nav from './Nav';

export default function ProtectedRoute() {
  const { t } = useI18n();
  const { user, family } = useAuth();

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-ink/40">{t('common.loading')}</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  // 和 Login.jsx 用同一个判据（user.familyId），否则两边会互相重定向
  if (!user.familyId) {
    return <Navigate to="/login" replace />;
  }
  // 有 familyId 但 family 详情还在路上
  if (family === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-ink/40">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen bg-porcelain">
      <Nav />
      <Outlet />
    </div>
  );
}
