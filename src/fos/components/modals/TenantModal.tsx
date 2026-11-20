import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import Icon from '@/fos/components/Icon';

export default function TenantModal() {
  const { setModal, counted, tenantRows, t, go } = useApp();
  const tenant = tenantRows.find((x: any) => x.name === counted);
  return (
    <>
      <Heading>{counted}</Heading>
      <StatusBadge status={tenant?.status ?? 'active'} />
      <p>
        {tenant?.plan} · {tenant?.users_count} users · {tenant?.branches_count} branches · {tenant?.manager_email ?? ''}
      </p>
      <div className="privacy">
        <Icon name="shield" />
        {t('بيانات الأعمال غير متاحة لمسؤولي المنصة.', 'Business data is not available to platform administrators.')}
      </div>
      <Button onClick={() => { setModal(''); go('support'); }}>{t('طلب وصول للدعم', 'Request support access')}</Button>
    </>
  );
}
