import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Smartphone, Send, Info } from 'lucide-react';
import { useI18n } from '../i18n';
import { domainLabel } from '../i18n/domain';
import { MEAL_SLOTS } from '../lib/constants';
import { updateFamily } from '../lib/familyAdmin';
import {
  pushSupported,
  isStandalone,
  isIOS,
  currentSubscription,
  enablePush,
  disablePush,
  sendTestPush,
} from '../lib/pushClient';

// 通知分两层，别混：
//   家庭开关 + 时间设置  —— 存在服务端，全家共用（决定"要不要发、什么时候发"）
//   这台设备的订阅       —— 存在浏览器里，一台一份（决定"发给谁"）
// 家庭开着但这台设备没订阅，这台就收不到 —— 所以两个都要有。
export default function NotificationPanel({ family, onFamilyChange }) {
  const { t, locale } = useI18n();
  const [subscribed, setSubscribed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lead, setLead] = useState(family?.notifyLeadMinutes ?? 60);
  const [times, setTimes] = useState(family?.mealTimes ?? {});

  const refresh = useCallback(async () => {
    if (!pushSupported()) return setSubscribed(false);
    setSubscribed(!!(await currentSubscription()));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const supported = pushSupported();
  // iOS 只有装成主屏应用才有 PushManager，标签页里根本订阅不了
  const iosNeedsInstall = !supported && isIOS() && !isStandalone();

  async function run(action, okMessage) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await action();
      if (okMessage) setNotice(okMessage);
    } catch (err) {
      setError(err.message || t('common.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-card p-3.5">
      <h4 className="font-display font-semibold text-sm flex items-center gap-1.5 mb-3">
        <Bell size={15} className="text-indigo" /> {t('notify.title')}
      </h4>

      {error && <p className="text-persimmon text-xs mb-2">{error}</p>}
      {notice && <p className="text-indigo text-xs mb-2">{notice}</p>}

      {/* 第一层：全家的开关和时间 */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!family?.notifyEnabled}
          disabled={busy}
          onChange={(e) =>
            run(async () => {
              const { family: next } = await updateFamily({ notifyEnabled: e.target.checked });
              onFamilyChange?.(next);
            })
          }
          className="mt-0.5 accent-indigo"
        />
        <span>
          <span className="text-sm font-medium">{t('notify.familyToggle')}</span>
          <span className="text-xs text-ink/45 block mt-0.5">{t('notify.familyToggleHint')}</span>
        </span>
      </label>

      {family?.notifyEnabled && (
        <div className="mt-3 space-y-3 border-t border-mist pt-3">
          <div>
            <label className="text-xs text-ink/45 block mb-1">{t('notify.lead')}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="1440"
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                className="w-20 px-3 py-2 rounded-lg border border-mist font-mono outline-none focus:border-indigo"
              />
              <span className="text-xs text-ink/40">{t('notify.minutes')}</span>
              <button
                onClick={() =>
                  run(async () => {
                    const { family: next } = await updateFamily({
                      notifyLeadMinutes: Number(lead),
                    });
                    onFamilyChange?.(next);
                  }, t('notify.saved'))
                }
                disabled={busy || Number(lead) === family.notifyLeadMinutes}
                className="px-3 py-2 rounded-lg bg-indigo text-porcelain text-sm font-medium disabled:opacity-40"
              >
                {t('common.save')}
              </button>
            </div>
            <p className="text-[11px] text-ink/35 mt-1 leading-relaxed">{t('notify.leadHint')}</p>
          </div>

          <div>
            <label className="text-xs text-ink/45 block mb-1">{t('notify.mealTimes')}</label>
            <div className="flex flex-wrap gap-2">
              {MEAL_SLOTS.map((meal) => (
                <span key={meal} className="flex items-center gap-1">
                  <span className="text-xs text-ink/50 w-12">
                    {domainLabel(locale, 'meal', meal)}
                  </span>
                  <input
                    type="time"
                    value={times[meal] ?? ''}
                    onChange={(e) => setTimes((prev) => ({ ...prev, [meal]: e.target.value }))}
                    className="px-2 py-1.5 rounded-md border border-mist font-mono text-sm outline-none"
                  />
                </span>
              ))}
              <button
                onClick={() =>
                  run(async () => {
                    const { family: next } = await updateFamily({ mealTimes: times });
                    onFamilyChange?.(next);
                  }, t('notify.saved'))
                }
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-mist text-sm"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 第二层：这一台设备 */}
      <div className="mt-3 border-t border-mist pt-3">
        <p className="text-xs text-ink/45 mb-2 flex items-center gap-1">
          <Smartphone size={13} /> {t('notify.thisDevice')}
        </p>

        {iosNeedsInstall ? (
          <p className="text-xs text-ink/50 bg-wheat/10 rounded-lg px-3 py-2 leading-relaxed flex gap-1.5">
            <Info size={14} className="text-wheat shrink-0 mt-0.5" />
            {t('notify.iosInstall')}
          </p>
        ) : !supported ? (
          <p className="text-xs text-ink/40">{t('notify.unsupported')}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {subscribed ? (
              <>
                <button
                  onClick={() => run(async () => { await disablePush(); await refresh(); })}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist text-sm text-ink/60 disabled:opacity-50"
                >
                  <BellOff size={15} /> {t('notify.disableDevice')}
                </button>
                <button
                  onClick={() =>
                    run(async () => {
                      const { sent } = await sendTestPush();
                      if (!sent) throw new Error(t('notify.testNoDevice'));
                    }, t('notify.testSent'))
                  }
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo text-sm text-indigo disabled:opacity-50"
                >
                  <Send size={15} /> {t('notify.test')}
                </button>
              </>
            ) : (
              <button
                onClick={() => run(async () => { await enablePush(); await refresh(); })}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo text-porcelain text-sm font-medium disabled:opacity-50"
              >
                <Bell size={15} /> {t('notify.enableDevice')}
              </button>
            )}
          </div>
        )}
        <p className="text-[11px] text-ink/35 mt-2 leading-relaxed">{t('notify.deviceHint')}</p>
      </div>
    </section>
  );
}
