// i18n 的纯逻辑部分：查表、占位符、单复数、日期格式化。
// 不含 React，所以可以直接在 node 里跑测试（React 部分在 index.jsx）。
//
// 为什么不上 react-i18next：这个应用只需要"查表 + 占位符 + 单复数"，
// 自己写大约 60 行，省一个依赖，也和项目里其它地方（轮询、离线队列都是手写的）一致。
//
// 语言存在 localStorage（按设备记），不存在账号上 —— 同一个账号在手机和电脑上
// 想用不同语言是很正常的。
import zh from './zh.js';
import en from './en.js';
import fr from './fr.js';

export const LOCALES = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
];

const DICTS = { zh, en, fr };
const STORAGE_KEY = 'meal-planner:locale';
const FALLBACK = 'zh';

export function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {
    // 隐私模式下 localStorage 可能不可用，那就按浏览器语言来
  }
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
  for (const lang of candidates) {
    const code = String(lang).toLowerCase().split('-')[0];
    if (DICTS[code]) return code;
  }
  return FALLBACK;
}

function lookup(dict, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), dict);
}

// 把 {name} 换成实际值
function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    vars[key] === undefined || vars[key] === null ? match : String(vars[key])
  );
}

export function translate(locale, key, vars) {
  let value = lookup(DICTS[locale], key);
  if (value === undefined && locale !== FALLBACK) value = lookup(DICTS[FALLBACK], key);
  // 缺翻译时直接把 key 显出来：漏了哪条一眼就看见，比显示空白好排查
  if (value === undefined) return key;

  if (value && typeof value === 'object') {
    // 单复数：中文只有一种形式，英语/法语要分。约定用 count 这个变量名。
    const n = Number(vars?.count ?? 0);
    const rule = new Intl.PluralRules(locale).select(Number.isFinite(n) ? n : 0);
    value = value[rule] ?? value.other ?? value.one ?? '';
  }
  return interpolate(String(value), vars);
}


// 按当前语言格式化日期；星期几也从日期算，不用后端返回的中文
export function makeFormatters(locale) {
  const parse = (iso) => {
    const [y, m, d] = String(iso ?? '').slice(0, 10).split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
  };
  return {
    formatDate: (iso, options = { year: 'numeric', month: 'short', day: 'numeric' }) => {
      const dt = parse(iso);
      return dt ? dt.toLocaleDateString(locale, options) : String(iso ?? '');
    },
    formatWeekday: (iso, style = 'short') => {
      const dt = parse(iso);
      return dt ? dt.toLocaleDateString(locale, { weekday: style }) : String(iso ?? '');
    },
  };
}

export function saveLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 存不下就算了，这一次会话内仍然生效
  }
}

// 给非 React 模块用（比如 lib/api.js 抛错时）：直接按当前语言翻译。
// 组件里请用 useI18n() 的 t()，会随语言切换重渲染。
export function tGlobal(key, vars) {
  return translate(detectLocale(), key, vars);
}
