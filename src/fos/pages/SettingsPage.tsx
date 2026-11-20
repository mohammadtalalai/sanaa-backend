import { useEffect, useState } from 'react';
import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Select, Option, Heading } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';

export default function SettingsPage() {
  const {
    lang,
    setLang,
    theme,
    setTheme,
    system,
    page,
    setModal,
    policy,
    setPolicy,
    support,
    setSupport,
    signOut,
    userName,
    userEmail,
    roles,
    ar,
    t,
    notify,
    record,
    go,
  } = useApp();
  const [draft, setDraft] = useState(policy);
  useEffect(() => setDraft(policy), [policy.tax, policy.discount]);
  return (
    <>
      <div className="settings-grid">
        <section className="panel settings-card">
          <Heading>
            {page === 'account'
              ? t('الملف الشخصي والتفضيلات', 'Profile & preferences')
              : t('إعدادات المصنع', 'Factory settings')}
          </Heading>
          <div className="field">
            <span>{t('اللغة', 'Language')}</span>
            <Select value={lang} onChange={(e) => setLang(e.target.value)}>
              <Option value="ar">العربية</Option>
              <Option value="en">English</Option>
            </Select>
          </div>
          <div className="field">
            <span>{t('المظهر', 'Theme')}</span>
            <Select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <Option value="light">{t('فاتح', 'Light')}</Option>
              <Option value="dark">{t('داكن', 'Dark')}</Option>
              <Option value="system">{t('النظام', 'System')}</Option>
            </Select>
          </div>
          {system === 'manager' && page === 'settings' && (
            <>
              <div className="field">
                <span>{t('معدل الضريبة (%)', 'Tax rate (%)')}</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.tax}
                  onChange={(e) => setDraft({ ...draft, tax: Math.max(0, Math.min(100, +e.target.value)) })}
                />
              </div>
              <div className="field">
                <span>{t('حد خصم الموظف (%)', 'Employee discount limit (%)')}</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.discount}
                  onChange={(e) => setDraft({ ...draft, discount: Math.max(0, Math.min(100, +e.target.value)) })}
                />
              </div>
              <Button
                onClick={() => {
                  setModal('team');
                }}
              >
                <Icon name="users" />
                {t('الفريق والأدوار', 'Team & roles')}
              </Button>
              <div className="notice">
                {t('الوصول المؤقت للدعم', 'Support access')} · {support}
              </div>
              {support === 'pending' && (
                <div className="toolbar">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSupport('approved');
                      record('Manager approved scoped access for 15 minutes');
                    }}
                  >
                    {t('موافقة لمدة ١٥ دقيقة', 'Approve for 15 minutes')}
                  </Button>
                  <Button
                    onClick={() => {
                      setSupport('denied');
                      record('Manager denied access');
                    }}
                  >
                    {t('رفض', 'Deny')}
                  </Button>
                </div>
              )}
              {['active', 'approved'].includes(support) && (
                <Button
                  onClick={() => {
                    setSupport('revoked');
                    record('Manager revoked support');
                  }}
                >
                  {t('إلغاء الوصول', 'Revoke access')}
                </Button>
              )}
            </>
          )}
          <Button
            variant="primary"
            onClick={async () => {
              if (system === 'manager' && page === 'settings' && (draft.tax !== policy.tax || draft.discount !== policy.discount)) {
                await setPolicy(draft);
                record(`Factory policy saved · tax ${draft.tax}% · discount ${draft.discount}%`);
              }
              notify('تم حفظ الإعدادات', 'Settings saved');
            }}
          >
            {t('حفظ الإعدادات', 'Save settings')}
          </Button>
        </section>
        <section className="panel settings-card">
          <Heading>{t('الأمان والصلاحيات', 'Security & permissions')}</Heading>
          <p>
            {t(
              `${userName} · ${userEmail} · ${roles.join(', ')}`,
              `${userName} · ${userEmail} · ${roles.join(', ')}`,
            )}
          </p>
          <Button onClick={() => setModal('password')}>{t('تغيير كلمة المرور', 'Change password')}</Button>
          <Button onClick={() => go('permissions')}>
            {t('عرض مصفوفة الصلاحيات', 'View permission matrix')}
          </Button>
          <Button
            onClick={() => signOut()}
          >
            <Icon name="logout" />
            {t('تسجيل الخروج', 'Sign out')}
          </Button>
          <div className="plan-usage">
            <span>PROFESSIONAL PLAN</span>
            <Heading>{t('مساحة للنمو', 'Room to grow')}</Heading>
            <p>
              8 / 25 {t('مستخدمين', 'users')} · 2 / 3 {t('فروع', 'branches')}
            </p>
            <div className="payment-progress">
              <span />
            </div>
            <small>
              {t(
                'عرض فقط · لا توجد صلاحيات لتعديل خطط المنصة',
                'Read only · Platform plan editing is not permitted',
              )}
            </small>
          </div>
        </section>
      </div>
    </>
  );
}
