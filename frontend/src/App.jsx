import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { I18nProvider } from './i18n';
import ProtectedRoute from './components/ProtectedRoute';
import AuthedRoute from './components/AuthedRoute';
import Login from './pages/Login';
import WeeklyMenu from './pages/WeeklyMenu';
import RecipeLibrary from './pages/RecipeLibrary';
import RecipeForm from './pages/RecipeForm';
import RecipeDetail from './pages/RecipeDetail';
import ShoppingList from './pages/ShoppingList';
import Settings from './pages/Settings';
import MealHistory from './pages/MealHistory';
// 卡包要用 jsbarcode + qrcode（合起来 100 多 KB），记账页也不小。
// 按需加载：只在真的点进这两个 tab 时才下载，别拖慢每次冷启动。
const CardWallet = lazy(() => import('./pages/CardWallet'));
const Ledger = lazy(() => import('./pages/Ledger'));

// 按需加载时的占位。不写文字，避免闪一下再被真内容替换掉
function PageLoading() {
  return <div className="max-w-3xl mx-auto px-4 pt-10 text-center text-ink/30 text-sm">···</div>;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/menu" replace />} />
            <Route path="/menu" element={<WeeklyMenu />} />
            <Route path="/recipes" element={<RecipeLibrary />} />
            <Route path="/recipes/new" element={<RecipeForm />} />
            <Route path="/recipes/:id" element={<RecipeDetail />} />
            <Route path="/recipes/:id/edit" element={<RecipeForm />} />
            <Route path="/shopping" element={<ShoppingList />} />
            <Route path="/history" element={<MealHistory />} />
            {/* 记账和卡包：和「吃饭」并列的两个 tab（按需加载） */}
            <Route path="/ledger" element={<Suspense fallback={<PageLoading />}><Ledger /></Suspense>} />
            <Route path="/cards" element={<Suspense fallback={<PageLoading />}><CardWallet /></Suspense>} />
          </Route>
          {/* 设置：账号设置 + 家庭管理 + 用户审核 三段都在这一页。
              不要求已加入家庭，所以用只判断登录的守卫。 */}
          <Route element={<AuthedRoute />}>
            <Route path="/settings" element={<Settings />} />
            {/* 旧地址都收拢到这一页 */}
            <Route path="/family" element={<Navigate to="/settings" replace />} />
            <Route path="/admin" element={<Navigate to="/settings" replace />} />
            <Route path="/admin/users" element={<Navigate to="/settings" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
