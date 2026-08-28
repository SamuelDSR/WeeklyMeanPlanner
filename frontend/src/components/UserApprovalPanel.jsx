import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AdminUserRow from '../components/AdminUserRow';
import {
  subscribeUsers,
  fetchUsers,
  approveUser,
  rejectUser,
  setUserAdmin,
  deleteUser,
} from '../lib/adminData';

const SECTIONS = [
  { status: 'pending', titleKey: 'admin.pending', hintKey: 'admin.pendingHint' },
  { status: 'approved', titleKey: 'admin.approved' },
  { status: 'rejected', titleKey: 'admin.rejected' },
];

export default function UserApprovalPanel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(
    () =>
      subscribeUsers((data) => {
        setUsers(data.users);
        setLoading(false);
      }),
    []
  );

  // 每次操作完重新拉一次列表：这样"最后一个管理员"之类的服务端判断结果也能立刻反映出来
  async function runAction(userId, action) {
    setError('');
    setBusyId(userId);
    try {
      await action();
      const data = await fetchUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err.message || t('common.actionFailed'));
    } finally {
      setBusyId(null);
    }
  }

  function handleReject(target) {
    runAction(target.id, () => rejectUser(target.id));
  }

  // 给自己降级会立刻失去这个页面的访问权，问一句再执行
  function handleToggleAdmin(target) {
    const isSelf = target.id === user?.id;
    if (isSelf && target.isAdmin && !window.confirm(t('admin.selfDemoteConfirm'))) {
      return;
    }
    runAction(target.id, () => setUserAdmin(target.id, !target.isAdmin));
  }

  function handleDelete(target) {
    if (!window.confirm(t('admin.deleteConfirm', { name: target.displayName, email: target.email }))) {
      return;
    }
    runAction(target.id, () => deleteUser(target.id));
  }

  const grouped = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        items: users.filter((u) => u.status === section.status),
      })),
    [users]
  );

  const pendingCount = grouped.find((g) => g.status === 'pending')?.items.length ?? 0;
  const otherAdminCount = users.filter(
    (u) => u.isAdmin && u.status === 'approved' && u.id !== user?.id
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-display font-semibold text-sm flex items-center gap-1.5 px-1">
          <Users size={15} className="text-indigo" /> {t('admin.title')}
        </h4>
        {pendingCount > 0 && (
          <span className="text-sm bg-wheat/15 text-wheat px-2.5 py-1 rounded-full font-medium">
            {t('admin.pendingCount', { count: pendingCount })}
          </span>
        )}
      </div>

      {error && (
        <p className="text-persimmon text-sm bg-persimmon/10 rounded-lg px-3 py-2 mb-3">{error}</p>
      )}

      {loading ? (
        <p className="text-ink/40 text-sm px-1">{t('common.loading')}</p>
      ) : (
        <div className="space-y-6">
          {grouped.map((section) =>
            section.items.length === 0 && section.status !== 'pending' ? null : (
              <section key={section.status}>
                <h4 className="text-sm font-medium text-ink/50 mb-2">
                  {t(section.titleKey)}
                  {section.items.length > 0 && ` · ${section.items.length}`}
                </h4>

                {section.items.length === 0 ? (
                  <p className="text-sm text-ink/35 bg-mist/40 rounded-xl px-3.5 py-3">
                    {t('admin.noPending')}
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {section.items.map((u) => (
                      <AdminUserRow
                        key={u.id}
                        user={u}
                        isSelf={u.id === user?.id}
                        otherAdminExists={otherAdminCount > 0}
                        busy={busyId === u.id}
                        onApprove={() => runAction(u.id, () => approveUser(u.id))}
                        onReject={() => handleReject(u)}
                        onToggleAdmin={() => handleToggleAdmin(u)}
                        onDelete={() => handleDelete(u)}
                      />
                    ))}
                  </ul>
                )}

                {section.hintKey && section.items.length > 0 && (
                  <p className="text-xs text-ink/35 mt-2">{t(section.hintKey)}</p>
                )}
              </section>
            )
          )}
        </div>
      )}
    </div>
  );
}
