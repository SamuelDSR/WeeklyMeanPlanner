import { Crown, ShieldCheck, UserMinus } from 'lucide-react';
import { useI18n } from '../i18n';

export default function FamilyMemberRow({ member, isSelf, canManage, busy, onTransfer, onRemove }) {
  const { t } = useI18n();
  return (
    <li className="flex items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm truncate">{member.displayName}</span>
          {member.isOwner && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-wheat bg-wheat/15 px-1.5 py-0.5 rounded">
              <Crown size={11} /> {t('family.owner')}
            </span>
          )}
          {member.isAdmin && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-indigo bg-indigo/10 px-1.5 py-0.5 rounded">
              <ShieldCheck size={11} /> {t('family.admin')}
            </span>
          )}
          {isSelf && <span className="text-[11px] text-ink/35">{t('family.you')}</span>}
        </div>
        <p className="text-xs text-ink/45 truncate mt-0.5">{member.email}</p>
      </div>

      {canManage && !member.isOwner && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={onTransfer}
            className="text-[11px] text-ink/50 border border-mist rounded-md px-2 py-1 disabled:opacity-50"
          >
            {t('family.makeOwner')}
          </button>
          {!isSelf && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="text-persimmon p-1 disabled:opacity-50"
              aria-label={t('family.removeMember', { name: member.displayName })}
            >
              <UserMinus size={15} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}
