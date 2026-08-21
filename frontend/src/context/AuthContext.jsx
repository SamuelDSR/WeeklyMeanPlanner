import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = 加载中, null = 未登录
  const [family, setFamily] = useState(undefined);

  async function refreshMe() {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      setFamily(user.family || null);
    } catch {
      setUser(null);
      setFamily(null);
    }
  }

  useEffect(() => {
    refreshMe();
  }, []);

  // 注册出来的账号默认是"待审核"，这时候后端不会发 cookie、也没有 user，
  // 页面拿到 status === 'pending' 后提示等管理员通过就行。
  // 只有管理员账号本身（ADMIN_EMAIL / 第一个注册的账号）会直接登录进去。
  async function register(email, password, displayName) {
    const { status, user, message } = await api.post('/auth/register', {
      email,
      password,
      displayName,
    });
    if (user) {
      setUser(user);
      setFamily(user.family || null);
    }
    return { status, message };
  }

  async function login(email, password) {
    await api.post('/auth/login', { email, password });
    // 登录成功后统一用 /auth/me 拉一次完整状态。
    // /auth/login 的返回里只有 familyId，没有 family 对象 ——
    // 直接拿它填 family 会得到 null，于是明明有家庭的人也被要求"新建/加入家庭"。
    await refreshMe();
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
    setFamily(null);
  }

  async function createFamily(name) {
    const { family } = await api.post('/auth/family/create', { name });
    setFamily(family);
    // user.familyId 也得跟着更新：路由判断看的是它（见 ProtectedRoute / Login）
    await refreshMe();
    return family.id;
  }

  async function joinFamily(inviteCode) {
    const { family } = await api.post('/auth/family/join', { inviteCode });
    setFamily(family);
    await refreshMe();
    return family.id;
  }

  // 家里几口人：决定每道菜要做几份
  async function updateMemberCount(memberCount) {
    const { family } = await api.patch('/family', { memberCount });
    setFamily(family);
    return family;
  }

  // 家庭设置在「家庭管理」页改完之后，同步一下顶部栏显示的名字等
  function applyFamily(next) {
    setFamily(next);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        family,
        isAdmin: !!user?.isAdmin,
        register,
        login,
        logout,
        createFamily,
        joinFamily,
        updateMemberCount,
        applyFamily,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
