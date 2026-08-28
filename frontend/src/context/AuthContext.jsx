import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { readCache, writeCache, clearAllCache, isNetworkError } from '../lib/localCache';

const AuthContext = createContext(null);

const ME_CACHE = 'auth-me';

export function AuthProvider({ children }) {
  // 先用上次记下的身份开局：断网时不用等 /auth/me 超时才知道自己是谁
  const cachedUser = readCache(ME_CACHE);
  const [user, setUser] = useState(cachedUser === null ? undefined : cachedUser);
  const [family, setFamily] = useState(cachedUser?.family ?? undefined);
  // 是不是正在用本地缓存撑着（界面上要给个提示）
  const [offline, setOffline] = useState(false);

  async function refreshMe() {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      setFamily(user.family || null);
      writeCache(ME_CACHE, user);
      setOffline(false);
    } catch (err) {
      // 断网 != 未登录。cookie 还是好的，只是暂时够不着服务器 ——
      // 这时候把人踢到登录页，等于地铁里一打开应用就什么都看不了。
      if (isNetworkError(err) && readCache(ME_CACHE)) {
        setOffline(true);
        return; // 保持上次的身份不动
      }
      // 服务器明确说不行（401 / 403 / 账号被删）才真的退出
      setUser(null);
      setFamily(null);
      clearAllCache();
      setOffline(false);
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
    await api.post('/auth/logout').catch(() => {
      // 离线也让人退得掉，本地状态该清就清
    });
    setUser(null);
    setFamily(null);
    clearAllCache();
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
        // 「够不着服务器」的权威信号：navigator.onLine 说的是有没有网卡连着，
        // 冷启动时它会报 true 而请求全都失败，所以以我们自己的请求为准
        offline,
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
