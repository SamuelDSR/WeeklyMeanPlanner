import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { readCache, writeCache, clearAllCache, isNetworkError } from '../lib/localCache';
import { subscribeReachability } from '../lib/reachability';

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
    } catch (err) {
      // 断网 != 未登录。cookie 还是好的，只是暂时够不着服务器 ——
      // 这时候把人踢到登录页，等于地铁里一打开应用就什么都看不了。
      if (isNetworkError(err) && readCache(ME_CACHE)) {
        return; // 断网：保持上次的身份不动（offline 由 reachability 统一置）
      }
      // 服务器明确说不行（401 / 403 / 账号被删）才真的退出
      setUser(null);
      setFamily(null);
      clearAllCache();
    }
  }

  useEffect(() => {
    refreshMe();
  }, []);

  // 「在不在线」交给 reachability 统一判断：任何一个请求成功都能把它拨回在线。
  //
  // 以前这个状态只由挂载时那一次 /auth/me 决定 —— iOS 上装到桌面后冷启动，
  // 网络栈还没就绪，第一次请求必然失败，提示条就永远挂在那儿了，
  // 哪怕后面所有请求都是好的。
  useEffect(() => subscribeReachability((ok) => setOffline(!ok)), []);

  // 掉线期间每 20 秒探一次。
  //
  // 光靠「回到前台」和 online 事件不够：应用一直开着、网络自己恢复的场景
  // （地铁出站、Wi-Fi 重连）不会触发任何事件，没有心跳就会一直挂着离线提示。
  // 只在离线时探，恢复了就停 —— 在线时白发请求没意义。
  useEffect(() => {
    if (!offline) return undefined;
    // 先密后疏：3s、6s、12s，之后每 20s 一次。
    // 网络只是抖了一下的话几秒就恢复显示，真断网了也不会一直空转。
    let delay = 3000;
    let timer;
    const tick = () => {
      if (document.visibilityState === 'visible') refreshMe();
      delay = Math.min(delay * 2, 20000);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [offline]);

  // 回到前台 / 重新联网时再确认一次身份。
  // 放着不管的话，管理员在服务端改了权限、或者账号被停用，这边一直不知道。
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible') refreshMe();
    };
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
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
