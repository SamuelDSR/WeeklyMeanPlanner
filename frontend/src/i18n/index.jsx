// i18n 的 React 部分：Provider + useI18n()。纯逻辑在 translate.js。
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { detectLocale, translate, makeFormatters, saveLocale } from './translate';

export { LOCALES } from './translate';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    saveLocale(locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      ...makeFormatters(locale),
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 I18nProvider 内使用');
  return ctx;
}
