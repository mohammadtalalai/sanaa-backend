import { useApp } from '@/fos/context/AppContext';
import { Button, Input } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';

export default function Topbar() {
  const {
    setLang,
    theme,
    setTheme,
    system,
    page,
    setPage,
    orders,
    search,
    setSearch,
    notifications,
    userName,
    ar,
    t,
    title,
    go,
  } = useApp();
  return (
    <>
      <header className="topbar">
        <div className="breadcrumb">
          {t('مساحة العمل', 'Workspace')}
          <span>/</span>
          <strong>{title}</strong>
        </div>
        <div className="header-actions">
          <div className="global-search">
            <Icon name="search" size={17} />
            <Input
              placeholder={t('ابحث عن طلب، عميل، أو منتج...', 'Search orders, customers, products...')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (page === 'dashboard' && system !== 'admin') setPage('sales');
              }}
            />
            <kbd>⌘ K</kbd>
          </div>
          <Button variant="icon language" onClick={() => setLang(ar ? 'en' : 'ar')}>
            <Icon name="globe" size={18} />
            {ar ? 'EN' : 'AR'}
          </Button>
          <Button
            variant="icon"
            aria-label={t('تغيير المظهر', 'Toggle theme')}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <Icon name="moon" />
          </Button>
          <Button
            variant="icon notification-button"
            aria-label={t('الإشعارات', 'Notifications')}
            onClick={() => go('notifications')}
          >
            <Icon name="bell" />
            {notifications > 0 && <i />}
          </Button>
          <span className="header-avatar">{userName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join(' ')}</span>
        </div>
      </header>
    </>
  );
}
