import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { useNavigate } from 'react-router-dom';
import { Home, Users, Pencil, Check, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import InviteCodeCard from '../components/InviteCodeCard';
import FamilyMemberRow from '../components/FamilyMemberRow';
import {
  fetchFamily,
  updateFamily,
  regenerateInviteCode,
  removeMember,
  transferOwnership,
  leaveFamily,
} from '../lib/familyAdmin';

export default function FamilyPanel() {
  const { user, applyFamily, refreshMe } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [countDraft, setCountDraft] = useState(2);

  const load = useCallback(async () => {
    try {
      const data = await fetchFamily();
      setFamily(data.family);
      setMembers(data.members);
      setNameDraft(data.family.name);
      setCountDraft(data.family.memberCount);
      applyFamily(data.family);
    } catch (err) {
      setError(err.message || t('common.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applyFamily]);

  useEffect(() => {
    load();
  }, [load]);

  // 所有会改动家庭的操作都走这里：出错时把错误显示出来，成功后重新拉一次
  async function run(id, action) {
    setError('');
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message || t('common.actionFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleLeave() {
    if (!window.confirm(t('family.leaveConfirm'))) return;
    setError('');
    try {
      await leaveFamily();
      await refreshMe();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message || t('family.leaveFailed'));
    }
  }

  if (loading) {
    return <p className="text-sm text-ink/40 px-1">{t('family.loading')}</p>;
  }
  if (!family) {
    return <p className="text-sm text-persimmon px-1">{error || t('family.notFound')}</p>;
  }

  const canManage = family.canManage;

  return (
    <div className="space-y-3">
      <h3 className="font-display font-semibold text-sm flex items-center gap-1.5 px-1">
        <Home size={15} className="text-indigo" /> {t('family.title')}
      </h3>

      {error && (
        <p className="text-persimmon text-sm bg-persimmon/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* 家庭名称 */}
      <div className="bg-white rounded-xl shadow-card p-3.5">
        <h3 className="text-sm font-medium text-ink/60 mb-2">{t('family.nameTitle')}</h3>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={40}
              className="flex-1 px-3 py-2 rounded-lg border border-mist outline-none focus:border-indigo"
            />
            <button
              onClick={() =>
                run('name', async () => {
                  await updateFamily({ name: nameDraft });
                  setEditingName(false);
                })
              }
              className="p-2.5 rounded-lg bg-indigo text-porcelain"
              aria-label={t('common.save')}
            >
              <Check size={18} />
            </button>
            <button
              onClick={() => {
                setEditingName(false);
                setNameDraft(family.name);
              }}
              className="text-sm text-ink/40"
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="font-display text-lg">{family.name}</span>
            {canManage && (
              <button
                onClick={() => setEditingName(true)}
                className="text-ink/40 hover:text-indigo p-1"
                aria-label={t('common.edit')}
              >
                <Pencil size={16} />
              </button>
            )}
          </div>
        )}
        {!canManage && (
          <p className="text-xs text-ink/35 mt-1.5">{t('family.nameOwnerOnly')}</p>
        )}
      </div>

      <InviteCodeCard
        code={family.inviteCode}
        canManage={canManage}
        onRegenerate={() => run('code', regenerateInviteCode)}
      />

      {/* 家里几口人 */}
      <div className="bg-white rounded-xl shadow-card p-3.5">
        <h3 className="text-sm font-medium text-ink/60 mb-2 flex items-center gap-1.5">
          <Users size={15} /> {t('family.membersTitle')}
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="50"
            value={countDraft}
            onChange={(e) => setCountDraft(e.target.value)}
            className="w-20 px-3 py-2 rounded-lg border border-mist font-mono outline-none focus:border-indigo"
          />
          <button
            onClick={() => run('count', () => updateFamily({ memberCount: Number(countDraft) }))}
            disabled={busyId === 'count' || Number(countDraft) === family.memberCount}
            className="px-3 py-2 rounded-lg bg-indigo text-porcelain text-sm font-medium disabled:opacity-40"
          >
            {t('common.save')}
          </button>
        </div>
        <p className="text-xs text-ink/40 mt-2">
          {t('family.membersHint')}
        </p>
      </div>

      {/* 成员 */}
      <div className="bg-white rounded-xl shadow-card p-3.5">
        <h3 className="text-sm font-medium text-ink/60 mb-1">
          {t('family.memberListTitle', { count: members.length })}
        </h3>
        <ul className="divide-y divide-mist">
          {members.map((m) => (
            <FamilyMemberRow
              key={m.id}
              member={m}
              isSelf={m.id === user?.id}
              canManage={canManage}
              busy={busyId === m.id}
              onTransfer={() =>
                window.confirm(t('family.transferConfirm', { name: m.displayName })) &&
                run(m.id, () => transferOwnership(m.id))
              }
              onRemove={() =>
                window.confirm(t('family.removeConfirm', { name: m.displayName })) &&
                run(m.id, () => removeMember(m.id))
              }
            />
          ))}
        </ul>
      </div>

      <button
        onClick={handleLeave}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-mist text-persimmon text-sm"
      >
        <LogOut size={15} /> {t('family.leave')}
      </button>
    </div>
  );
}
