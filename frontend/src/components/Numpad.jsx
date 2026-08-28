import { Delete, CalendarDays } from 'lucide-react';
import { useI18n } from '../i18n';

// 记账用的小键盘。
//
// 为什么不用系统键盘：记账是「掏出手机、按几下、收起来」的动作，
// 系统数字键盘没有 + −，也没有改日期的地方，来回切换反而更慢。
// 这里把金额、加减、日期、完成放在同一块区域，一只手就能按完。
export default function Numpad({ onKey, onDone, onPickDate, dateLabel, canSubmit }) {
  const { t } = useI18n();

  const Key = ({ children, onClick, className = '', label }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // 每个键至少 56px 高：厨房里、超市里都是单手快按，键太小很容易按错
      className={`h-14 flex items-center justify-center text-xl font-mono
                  active:bg-mist/70 transition-colors ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="grid grid-cols-4 gap-px bg-mist border-t border-mist select-none">
      {['7', '8', '9'].map((n) => (
        <Key key={n} onClick={() => onKey(n)} className="bg-white">{n}</Key>
      ))}
      {/* 日期放在右上角：改日期的频率比加减低，但比清空高 */}
      <Key onClick={onPickDate} className="bg-white text-sm gap-1" label={t('ledger.date')}>
        <CalendarDays size={15} className="text-wheat" />
        <span className="text-xs">{dateLabel}</span>
      </Key>

      {['4', '5', '6'].map((n) => (
        <Key key={n} onClick={() => onKey(n)} className="bg-white">{n}</Key>
      ))}
      <Key onClick={() => onKey('+')} className="bg-white text-2xl">+</Key>

      {['1', '2', '3'].map((n) => (
        <Key key={n} onClick={() => onKey(n)} className="bg-white">{n}</Key>
      ))}
      <Key onClick={() => onKey('-')} className="bg-white text-2xl">−</Key>

      <Key onClick={() => onKey('.')} className="bg-white">.</Key>
      <Key onClick={() => onKey('0')} className="bg-white">0</Key>
      <Key onClick={() => onKey('back')} className="bg-white" label={t('ledger.backspace')}>
        <Delete size={20} />
      </Key>
      <button
        type="button"
        onClick={onDone}
        disabled={!canSubmit}
        className="h-14 bg-indigo text-porcelain font-medium disabled:opacity-40 disabled:bg-ink/30"
      >
        {t('ledger.done')}
      </button>
    </div>
  );
}
