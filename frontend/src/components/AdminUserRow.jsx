import { ShieldCheck, Check, Ban, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';

const STATUS_STYLES = {
  pending: { labelKey: 'admin.pending', className: 'bg-wheat/15 text-wheat' },
  approved: { labelKey: 'admin.approved', className: 'bg-indigo/10 text-indigo' },
  rejected: { labelKey: 'admin.rejected', className: 'bg-persimmon/10 text-persimmon' },
};

export default function AdminUserRow({
  user,
  isSelf,
  otherAdminExists,
  busy,
  onApprove,
  onReject,
  onToggleAdmin,
  onDelete,
}) {
  const { t, formatDate } = useI18n();
  const status = STATUS_STYLES[user.status] || STATUS_STYLES.pending;

  return (
    <li className="bg-white rounded-xl shadow-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-ink truncate">{user.displayName}</span>
            {user.isAdmin && (
              <span className="inline-flex items-center gap-0.5 text-xs text-indigo bg-indigo/10 px-1.5 py-0.5 rounded">
                <ShieldCheck size={12} /> {t('admin.adminBadge')}
              </span>
            )}
            {isSelf && <span className="text-xs text-ink/40">{t('admin.you')}</span>}
          </div>
          <p className="text-sm text-ink/50 truncate mt-0.5">{user.email}</p>
          <p className="text-xs text-ink/35 mt-1">
            {user.familyName ? t('admin.joinedFamily', { name: user.familyName }) : t('admin.noFamily')}
            {user.createdAt && ` · ${t('admin.registeredOn', { date: formatDate(user.createdAt) })}`}
          </p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
          {t(status.labelKey)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {user.status !== 'approved' && (
          <button
            disabled={busy}
            onClick={onApprove}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-indigo text-porcelain font-medium disabled:opacity-50"
          >
            <Check size={15} /> {t('admin.approve')}
          </button>
        )}

        {user.status !== 'rejected' && !isSelf && (
          <button
            disabled={busy}
            onClick={onReject}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-mist text-ink/60 disabled:opacity-50"
          >
            <Ban size={15} /> {t('admin.reject')}
          </button>
        )}

        {/* 自己只有在还有别的管理员时才能取消自己的管理员身份 */}
        {user.status === 'approved' && (!isSelf || otherAdminExists) && (
          <button
            disabled={busy}
            onClick={onToggleAdmin}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-mist text-ink/60 disabled:opacity-50"
          >
            <ShieldCheck size={15} /> {user.isAdmin ? t('admin.unmakeAdmin') : t('admin.makeAdmin')}
          </button>
        )}

        {!isSelf && (
          <button
            disabled={busy}
            onClick={onDelete}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg text-persimmon disabled:opacity-50 ml-auto"
          >
            <Trash2 size={15} /> {t('common.delete')}
          </button>
        )}
      </div>
    </li>
  );
}
