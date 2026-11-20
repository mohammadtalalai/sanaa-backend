import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';

export default function NotificationsPage() {
  const { notificationRows, markAllRead, markRead, ar, t, go } = useApp();
  return (
    <section className="panel">
      <div className="panel-heading">
        <Heading>{t('مركز الإشعارات', 'Notification center')}</Heading>
        <Button onClick={markAllRead}>{t('قراءة الكل', 'Mark all read')}</Button>
      </div>
      {!notificationRows.length && <div className="empty">{t('لا توجد إشعارات', 'No notifications')}</div>}
      {notificationRows.map((n: any) => (
        <Button key={n.id} variant={`record-row ${n.read ? 'read' : ''}`} onClick={() => { markRead(n.id); go(n.link || 'sales'); }}>
          <Icon name="bell" />
          <strong>{ar ? n.title_ar : n.title_en}</strong>
          <span>{new Date(n.created_at).toLocaleString(ar ? 'ar-EG' : 'en-GB')}</span>
          <Icon name="arrow" />
        </Button>
      ))}
    </section>
  );
}
