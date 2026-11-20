import { useApp } from '@/fos/context/AppContext';
import { Button } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';
import { brandLogoUrl } from '@/fos/lib/brand';

export default function Sidebar() {
  const { system, page, approvals, sidebarScroll, t, nav, go, userName, settings, ar } = useApp();
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join(' ') || '·';
  return (
    <>
      <aside className={`sidebar ${system === 'employee' ? 'employee-sidebar' : ''}`}>
        <div className="sidebar-scroll" ref={sidebarScroll}>
          <div className="brand">
            <img className="logo-img" src={brandLogoUrl} alt="" width={34} height={34} />
            <div>
              <strong>
                صنعة <span>SANAA</span>
              </strong>
              <small>
                {system === 'admin'
                  ? 'PLATFORM CONSOLE'
                  : system === 'employee'
                    ? 'SHOWROOM APP'
                    : 'FACTORY MANAGEMENT'}
              </small>
            </div>
          </div>
          <div className="factory-switch">
            <div className="factory-avatar">
              <Icon name="factory" />
            </div>
            <div>
              <strong>
                {system === 'admin'
                  ? t('إدارة المنصة', 'Platform workspace')
                  : (ar ? settings?.factory_name_ar : settings?.factory_name_en) ?? ''}
              </strong>
              <small>
                {system === 'admin' ? 'Super Admin' : (ar ? settings?.branch_label_ar : settings?.branch_label_en) ?? ''}
              </small>
            </div>
            <Icon name="down" size={15} />
          </div>
          <div className="nav-label">{t('مساحة العمل', 'WORKSPACE')}</div>
          <nav>
            {nav.map(([key, icon, a, e]) => (
              <Button key={key} variant={`nav-item ${page === key ? 'active' : ''}`} onClick={() => go(key)}>
                <Icon name={icon} />
                <span>{t(a, e)}</span>
                {key === 'approvals' && (
                  <span className="nav-count">{approvals.filter((a) => a.status === 'pending').length}</span>
                )}
                {key === 'ai' && <span className="ai-label">AI</span>}
              </Button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="plan-card">
              <div>
                <Icon name="spark" size={17} />
                <strong>{t('مساحة للأفكار الكبيرة', 'Room for bigger ideas')}</strong>
              </div>
              <p>{t('خطتك الاحترافية تدعم نمو مصنعك.', 'Your professional plan supports your growth.')}</p>
              <Button variant="plan-button" onClick={() => go('settings')}>
                {t('عرض الخطة والاستخدام', 'View plan & usage')}
                <Icon name="arrow" size={16} />
              </Button>
            </div>
            <Button
              variant="nav-item"
              onClick={() => {
                go('audit');
              }}
            >
              <Icon name="shield" />
              {t('سجل النشاط', 'Activity log')}
            </Button>
            <Button variant="profile" onClick={() => go('account')}>
              <span className="avatar">{initials}</span>
              <span>
                <strong>{userName}</strong>
                <small>
                  {system === 'admin'
                    ? 'Super Admin'
                    : system === 'employee'
                      ? t('موظف مبيعات', 'Sales employee')
                      : t('مدير المصنع', 'Factory manager')}
                </small>
              </span>
              <Icon name="more" />
            </Button>
          </div>
        </div>
        <Button
          variant="sidebar-scroll-down"
          aria-label={t('النزول في القائمة الجانبية', 'Scroll sidebar down')}
          onClick={() =>
            sidebarScroll.current?.scrollBy({
              top: 240,
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            })
          }
        >
          <Icon name="down" size={18} />
          <span>{t('المزيد', 'More')}</span>
        </Button>
      </aside>
    </>
  );
}
