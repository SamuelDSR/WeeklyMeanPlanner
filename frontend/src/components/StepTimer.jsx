import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function StepTimer({ seconds }) {
  const { t } = useI18n();
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    setRemaining(seconds);
    setRunning(false);
  }, [seconds]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            // 简单的完成提示音（浏览器 Beep 兼容性不一，用震动作为主要提示）
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const done = remaining === 0;

  return (
    <div className="flex items-center gap-3 mt-2 bg-mist/60 rounded-lg px-3 py-2 w-fit">
      <span className={`font-mono text-lg tabular-nums ${done ? 'text-persimmon' : 'text-ink'}`}>
        {formatTime(remaining)}
      </span>
      <button
        onClick={() => setRunning((v) => !v)}
        disabled={done}
        className="p-1.5 rounded-full bg-indigo text-porcelain disabled:opacity-40"
        aria-label={running ? t('timer.pause') : t('timer.start')}
      >
        {running ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button
        onClick={() => {
          setRemaining(seconds);
          setRunning(false);
        }}
        className="p-1.5 rounded-full bg-porcelain border border-mist text-ink/60"
        aria-label={t('timer.reset')}
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}
