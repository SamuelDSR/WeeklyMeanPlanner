import { Link } from 'react-router-dom';
import {
  Settings as SettingsIcon, UtensilsCrossed, Wallet, CreditCard, Home, ShieldCheck, User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCallback, useEffect, useState } from 'react';
import AccountSettingsPanel from '../components/AccountSettingsPanel';
import NotificationPanel from '../components/NotificationPanel';
import { fetchFamily } from '../lib/familyAdmin';
import FamilyPanel from '../components/FamilyPanel';
import StaplePanel from '../components/StaplePanel';
import LedgerSettingsPanel from '../components/LedgerSettingsPanel';
import CardSettingsPanel from '../components/CardSettingsPanel';
import UserApprovalPanel from '../components/UserApprovalPanel';
import SettingsSection from '../components/SettingsSection';
import { useI18n } from '../i18n';

// 设置按**功能域**分组，和底部导航一一对应：
//
//   账号        只跟你自己有关
//   吃饭        主食、做饭提醒     <- 对应「吃饭」tab
//   记账        默认货币           <- 对应「记账」tab
//   卡包        卡片顺序、横屏     <- 对应「卡包」tab
//   家庭        成员、邀请码、时区
//   用户审核    整个应用，只有管理员看得到
//
// 以前是平铺一长串面板，加了记账和卡包之后就找不着北了 ——
// 分组之后「某个功能的设置在哪」不用猜，跟着 tab 的名字找就行。
export default function Settings() {
  const { t } = useI18n();
  const { family, isAdmin } = useAuth();
  // 通知和货币都存在家庭上，这里单独拉一份完整的（AuthContext 里那个字段不全）
  const [familyDetail, setFamilyDetail] = useState(null);

  const loadFamily = useCallback(() => {
    if (!family) return;
    fetchFamily()
      .then((d) => setFamilyDetail(d.family))
      .catch(() => setFamilyDetail(null));
  }, [family]);

  useEffect(loadFamily, [loadFamily]);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-nav space-y-6">
      <h2 className="font-display font-bold text-xl flex items-center gap-2">
        <SettingsIcon size={19} className="text-indigo" /> {t('settings.title')}
      </h2>

      <SettingsSection icon={User} title={t('settings.sectionAccount')}>
        <AccountSettingsPanel />
      </SettingsSection>

      {!family && (
        <p className="text-sm text-ink/40 bg-mist/40 rounded-xl px-3.5 py-3">
          {t('settings.noFamily')}
          <Link to="/login" className="text-indigo underline ml-1">
            {t('settings.noFamilyLink')}
          </Link>
        </p>
      )}

      {family && (
        <>
          <SettingsSection icon={UtensilsCrossed} title={t('nav.eat')}>
            <StaplePanel />
            {familyDetail && (
              <NotificationPanel family={familyDetail} onFamilyChange={setFamilyDetail} />
            )}
          </SettingsSection>

          <SettingsSection icon={Wallet} title={t('nav.ledger')}>
            {familyDetail && (
              <LedgerSettingsPanel family={familyDetail} onFamilyChange={setFamilyDetail} />
            )}
          </SettingsSection>

          <SettingsSection icon={CreditCard} title={t('nav.cards')}>
            <CardSettingsPanel />
          </SettingsSection>

          <SettingsSection icon={Home} title={t('settings.sectionFamily')}>
            <FamilyPanel />
          </SettingsSection>
        </>
      )}

      {isAdmin && (
        <SettingsSection icon={ShieldCheck} title={t('settings.sectionAdmin')}>
          <UserApprovalPanel />
        </SettingsSection>
      )}
    </div>
  );
}
