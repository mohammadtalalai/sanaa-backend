import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';

export default function PageHeading() {
  const { system, page, setModal, t, title, newOrder, userName, ar } = useApp();
  const first = userName.split(/\s+/)[0] ?? '';
  const hour = new Date().getHours();
  const today = new Date().toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {system === 'admin'
              ? 'PLATFORM OPERATIONS'
              : system === 'employee'
                ? 'YOUR SHOWROOM, CONNECTED'
                : 'YOUR FACTORY, CONNECTED'}
          </div>
          <Heading level={1}>
            {page === 'dashboard' ? t('كل التفاصيل، في مكان واحد.', 'Every detail, in one place.') : title}
          </Heading>
          <p>
            {page === 'dashboard'
              ? t(
                  `${hour < 12 ? 'صباح الخير' : 'مساء الخير'}، ${first}. إليك ما يحدث في مصنعك اليوم.`,
                  `${hour < 12 ? 'Good morning' : 'Good evening'}, ${first}. Here’s what’s happening today.`,
                )
              : t(
                  'إدارة أوضح. قرارات أفضل. وصناعة تستحق الثقة.',
                  'Clearer operations. Better decisions. Beautifully made.',
                )}
          </p>
        </div>
        <div className="heading-actions">
          <span className="date-label">
            <Icon name="clock" size={16} />
            {today}
          </span>
          <Button variant="primary" onClick={() => (system === 'admin' ? setModal('factory') : newOrder())}>
            <Icon name="plus" size={18} />
            {system === 'admin' ? t('إضافة مصنع', 'Create factory') : t('طلب جديد', 'New order')}
          </Button>
        </div>
      </div>
    </>
  );
}
