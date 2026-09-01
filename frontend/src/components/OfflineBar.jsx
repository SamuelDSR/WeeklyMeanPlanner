import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { subscribeSync, flushQueue, failedOps, clearFailed } from '../lib/syncQueue';
import { useI18n } from '../i18n';
import { subscribeReachability } from '../lib/reachability';

// 顶部的离线/待同步提示条。
//
// 离线本身不该打断人做事，但**必须让人知道**：
// 记的账还在手机里没上去，跟已经上去了，是两回事。
export default function OfflineBar() {
  const { t } = useI18n();
  // navigator.onLine 只说明「有没有网卡连着」，不代表**够得着服务器**。
  // 实测：冷启动时它报 true，而请求全部 Failed to fetch（弱信号、强制门户、
  // 服务器挂了都是这样）。所以以「我们自己的请求成没成功」为准。
  //
  // 这个信号由 lib/reachability 维护，**每个请求**都会更新它 ——
  // 只要有一个请求成功，提示条就自己消失，不会卡在离线状态下不来。
  const [navOnline, setNavOnline] = useState(() => navigator.onLine !== false);
  const [reachable, setReachable] = useState(true);
  const online = navOnline && reachable;
  const [sync, setSync] = useState({ pending: 0, failed: [] });
  const [showFailed, setShowFailed] = useState(false);

  useEffect(() => {
    const up = () => setNavOnline(true);
    const down = () => setNavOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => subscribeReachability(setReachable), []);

  const failed = sync.failed || [];

  // 什么都正常就不占地方
  if (online && sync.pending === 0 && failed.length === 0) return null;

  return (
    <>
      <div
        className={`px-4 py-1.5 text-xs flex items-center justify-center gap-1.5 ${
          online ? 'bg-wheat/20 text-ink/70' : 'bg-ink/80 text-porcelain'
        }`}
      >
        {online ? (
          <>
            <RefreshCw size={12} className={sync.pending ? 'animate-spin' : ''} />
            {sync.pending > 0 ? t('offline.syncing', { count: sync.pending }) : t('offline.backOnline')}
            {sync.pending > 0 && (
              <button onClick={() => flushQueue()} className="underline ml-1">
                {t('offline.retryNow')}
              </button>
            )}
          </>
        ) : (
          <>
            <CloudOff size={12} />
            {sync.pending > 0 ? t('offline.offlineWithPending', { count: sync.pending }) : t('offline.offline')}
          </>
        )}
      </div>

      {/* 发不上去的操作要摊开说，不能悄悄丢掉 */}
      {failed.length > 0 && (
        <div className="px-4 py-1.5 text-xs bg-persimmon/15 text-persimmon flex items-center gap-1.5">
          <AlertTriangle size={12} className="shrink-0" />
          <button onClick={() => setShowFailed((v) => !v)} className="underline flex-1 text-left">
            {t('offline.failedCount', { count: failed.length })}
          </button>
          <button onClick={clearFailed} className="p-1" aria-label={t('common.close')}>
            <X size={12} />
          </button>
        </div>
      )}
      {showFailed && failed.length > 0 && (
        <ul className="px-4 py-2 text-[11px] bg-persimmon/5 text-ink/60 space-y-1">
          {failed.slice(0, 6).map((op) => (
            <li key={op.opId} className="truncate">
              · {op.error}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
