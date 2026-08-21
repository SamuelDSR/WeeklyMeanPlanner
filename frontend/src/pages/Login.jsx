import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChefHat, MailCheck, ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n';

export default function Login() {
  const { user, family, login, register, createFamily, joinFamily } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 注册成功但还要等管理员审核时显示的提示
  const [pendingNotice, setPendingNotice] = useState('');

  // 家庭设置的两种方式
  const [familyMode, setFamilyMode] = useState('create');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        const { status, message } = await register(email, password, displayName);
        if (status === 'pending') {
          setPendingNotice(message || t('login.pendingDefault'));
        }
      }
    } catch (err) {
      setError(err.message || t('login.genericError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleFamilySubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (familyMode === 'create') {
        await createFamily(familyName);
      } else {
        await joinFamily(inviteCode);
      }
    } catch (err) {
      setError(err.message || t('login.genericError'));
    } finally {
      setBusy(false);
    }
  }

  // 已经登录、而且账号上挂着家庭 —— 该进应用了。
  // 判断用 user.familyId 而不是 family 对象：familyId 在 /auth/login 和 /auth/me
  // 的返回里都有，而 family 对象只有 /auth/me 才给。用后者会让刚登录的人
  // 被误判成"还没加入家庭"。ProtectedRoute 用的是同一个判据，两边不会互相跳。
  if (user && user.familyId) {
    return <Navigate to="/menu" replace />;
  }

  // 注册成功，但要等管理员审核
  if (pendingNotice) {
    return (
      <div className="min-h-screen bg-porcelain flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <MailCheck className="mx-auto text-indigo" size={40} />
          <h2 className="font-display font-bold text-xl mt-3">{t('login.submittedTitle')}</h2>
          <p className="text-ink/60 text-sm mt-2 leading-relaxed">{pendingNotice}</p>
          <p className="text-ink/40 text-xs mt-2">{t('login.submittedHint')}</p>
          <button
            onClick={() => {
              setPendingNotice('');
              setMode('login');
              setPassword('');
              setDisplayName('');
            }}
            className="w-full mt-6 py-2.5 rounded-lg bg-indigo text-porcelain font-medium"
          >
            {t('login.backToSignIn')}
          </button>
        </div>
      </div>
    );
  }

  // 已登录但确实还没加入/创建家庭
  if (user && !user.familyId) {
    return (
      <div className="min-h-screen bg-porcelain flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <ChefHat className="mx-auto text-indigo" size={36} />
            <h2 className="font-display font-bold text-xl mt-2">{t('login.familyTitle')}</h2>
            <p className="text-ink/50 text-sm mt-1">{t('login.familySubtitle')}</p>
          </div>

          <div className="flex rounded-lg overflow-hidden border border-mist mb-4">
            <button
              onClick={() => setFamilyMode('create')}
              className={`flex-1 py-2 text-sm font-medium ${familyMode === 'create' ? 'bg-indigo text-porcelain' : 'bg-porcelain text-ink/60'}`}
            >
              {t('login.createFamily')}
            </button>
            <button
              onClick={() => setFamilyMode('join')}
              className={`flex-1 py-2 text-sm font-medium ${familyMode === 'join' ? 'bg-indigo text-porcelain' : 'bg-porcelain text-ink/60'}`}
            >
              {t('login.joinFamily')}
            </button>
          </div>

          <form onSubmit={handleFamilySubmit} className="space-y-3">
            {familyMode === 'create' ? (
              <input
                required
                placeholder={t('login.familyNamePlaceholder')}
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-mist bg-white focus:border-indigo outline-none"
              />
            ) : (
              <input
                required
                placeholder={t('login.inviteCodePlaceholder')}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-mist bg-white focus:border-indigo outline-none uppercase"
              />
            )}
            {error && <p className="text-persimmon text-sm">{error}</p>}
            <button
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-indigo text-porcelain font-medium disabled:opacity-50"
            >
              {busy ? t('common.processing') : familyMode === 'create' ? t('login.createAction') : t('login.joinAction')}
            </button>
          </form>

          {/* 管理员可能只是来审核账号的，不一定要先建家庭 */}
          {user?.isAdmin && (
            <Link
              to="/settings"
              className="flex items-center justify-center gap-1 text-sm text-indigo mt-4"
            >
              <ShieldCheck size={15} /> {t('login.reviewFirst')}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-porcelain flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <ChefHat className="mx-auto text-indigo" size={40} />
          <h1 className="font-display font-bold text-2xl mt-3 text-ink">{t('nav.appName')}</h1>
          <p className="text-ink/50 text-sm mt-1">{t('login.tagline')}</p>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-3">
          {mode === 'register' && (
            <input
              required
              placeholder={t('login.displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-mist bg-white focus:border-indigo outline-none"
            />
          )}
          <input
            required
            type="email"
            placeholder={t('login.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-mist bg-white focus:border-indigo outline-none"
          />
          <input
            required
            type="password"
            placeholder={t('login.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-mist bg-white focus:border-indigo outline-none"
          />
          {error && <p className="text-persimmon text-sm">{error}</p>}
          <button
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-indigo text-porcelain font-medium disabled:opacity-50"
          >
            {busy ? t('common.processing') : mode === 'login' ? t('login.signIn') : t('login.signUp')}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
          className="w-full text-center text-sm text-indigo mt-4"
        >
          {mode === 'login' ? t('login.toSignUp') : t('login.toSignIn')}
        </button>

        {mode === 'register' && (
          <p className="text-center text-xs text-ink/40 mt-3 leading-relaxed">
            {t('login.needsApproval')}
          </p>
        )}
      </div>
    </div>
  );
}
