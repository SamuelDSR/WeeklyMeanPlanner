import { useState } from 'react';
import { UserCog, LogOut, Check, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n, LOCALES } from '../i18n';
import { updateDisplayName } from '../lib/accountData';

// 账号设置：跟"这个人"有关的东西（跟家庭、跟整个应用无关）
export default function AccountSettingsPanel() {
  const { user, logout, refreshMe } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user?.displayName || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setError('');
    setBusy(true);
    try {
      await updateDisplayName(draft);
      await refreshMe();
      setEditing(false);
    } catch (err) {
      setError(err.message || t('common.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-card p-3.5">
      <h4 className="font-display font-semibold text-sm flex items-center gap-1.5 mb-3">
        <UserCog size={15} className="text-indigo" /> {t('settings.accountTitle')}
      </h4>

      {error && <p className="text-persimmon text-xs mb-2">{error}</p>}

      <div className="space-y-3">
        <div>
          <label className="text-xs text-ink/45 block mb-1">{t('settings.displayName')}</label>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={40}
                className="flex-1 px-3 py-2 rounded-lg border border-mist outline-none focus:border-indigo"
              />
              <button
                onClick={save}
                disabled={busy}
                className="p-2.5 rounded-lg bg-indigo text-porcelain disabled:opacity-50"
                aria-label={t('common.save')}
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setDraft(user?.displayName || '');
                  setError('');
                }}
                className="text-sm text-ink/40 px-2 py-2"
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm">{user?.displayName}</span>
              <button
                onClick={() => setEditing(true)}
                className="text-ink/40 p-2 -m-1"
                aria-label={t('common.edit')}
              >
                <Pencil size={16} />
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-ink/45 block mb-1">{t('settings.email')}</label>
          <p className="text-sm text-ink/60">{user?.email}</p>
        </div>

        <div>
          <label className="text-xs text-ink/45 block mb-1" htmlFor="locale-select">
            {t('settings.language')}
          </label>
          {/* 语言按设备记（localStorage），不写在账号上：
              同一个账号在手机和电脑上想用不同语言是很正常的 */}
          <select
            id="locale-select"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-mist bg-white outline-none focus:border-indigo"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-mist text-persimmon text-sm"
        >
          <LogOut size={15} /> {t('settings.logout')}
        </button>
      </div>
    </section>
  );
}
