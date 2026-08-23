import { Link } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import AccountSettingsPanel from '../components/AccountSettingsPanel';
import NotificationPanel from '../components/NotificationPanel';
import { fetchFamily } from '../lib/familyAdmin';
import FamilyPanel from '../components/FamilyPanel';
import StaplePanel from '../components/StaplePanel';
import UserApprovalPanel from '../components/UserApprovalPanel';
import { useI18n } from '../i18n';

// 一个 tab 装三段，按"跟谁有关"从近到远排：
//   账号设置   -> 只跟你自己有关，人人可见
//   家庭管理   -> 跟你家有关，加入了家庭才显示（改设置的权限在里面再判断）
//   主食设置   -> 也是家庭级的：默认吃什么主食、每人一顿多少
//   用户审核   -> 跟整个应用有关，只有应用管理员看得到
export default function Settings() {
  const { t } = useI18n();
  const { family, isAdmin } = useAuth();
  // 通知设置存在家庭上，这里单独拉一份：
  // AuthContext 里的 family 没有餐次时间、提前量这些字段
  const [familyDetail, setFamilyDetail] = useState(null);

  const loadFamily = useCallback(() => {
    if (!family) return;
    fetchFamily()
      .then((d) => setFamilyDetail(d.family))
      .catch(() => setFamilyDetail(null));
  }, [family]);

  useEffect(loadFamily, [loadFamily]);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav space-y-5">
      <h2 className="font-display font-bold text-xl flex items-center gap-2">
        <SettingsIcon size={19} className="text-indigo" /> {t('settings.title')}
      </h2>

      <AccountSettingsPanel />

      {family && familyDetail && (
        <NotificationPanel family={familyDetail} onFamilyChange={setFamilyDetail} />
      )}

      {/* 主食设置：默认吃什么主食、每人一顿多少 —— 购物清单靠它算量 */}
      {family && <StaplePanel />}

      {family ? (
        <FamilyPanel />
      ) : (
        <p className="text-sm text-ink/40 bg-mist/40 rounded-xl px-3.5 py-3">
          {t('settings.noFamily')}
          <Link to="/login" className="text-indigo underline ml-1">
            {t('settings.noFamilyLink')}
          </Link>
        </p>
      )}

      {isAdmin && <UserApprovalPanel />}
    </div>
  );
}
