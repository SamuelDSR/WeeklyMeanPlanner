import { useState } from 'react';
import { Coins } from 'lucide-react';
import { updateFamily } from '../lib/familyAdmin';
import { useI18n } from '../i18n';

// 记账设置：目前就一件事 —— 默认货币。
// 记一笔的时候默认填它，但每笔开销自己存着货币，改默认值不会动到历史账目。
const CURRENCIES = [
  'EUR', 'USD', 'CNY', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF',
];

export default function LedgerSettingsPanel({ family, onFamilyChange }) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function change(currency) {
    setError('');
    setSaving(true);
    try {
      const { family: next } = await updateFamily({ currency });
      onFamilyChange(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(e.message || t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-3.5">
      <h4 className="font-display font-semibold flex items-center gap-2 mb-1">
        <Coins size={16} className="text-wheat" /> {t('ledgerSettings.currencyTitle')}
      </h4>
      <p className="text-xs text-ink/45 leading-relaxed mb-2.5">
        {t('ledgerSettings.currencyHint')}
      </p>
      <div className="flex items-center gap-2">
        <select
          value={family?.currency || 'EUR'}
          disabled={saving}
          onChange={(e) => change(e.target.value)}
          className="px-3 py-2 rounded-lg border border-mist bg-white outline-none text-sm font-mono"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {saved && <span className="text-xs text-matcha">{t('common.saved')}</span>}
      </div>
      {error && <p className="text-persimmon text-sm mt-2">{error}</p>}
      <p className="text-[11px] text-ink/35 mt-2 leading-relaxed">
        {t('ledgerSettings.noConversion')}
      </p>
    </div>
  );
}
