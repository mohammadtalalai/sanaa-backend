import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import Icon from '@/fos/components/Icon';
import { statusLabels } from '@/fos/data/statusLabels';

export default function OrderModal() {
  const { setModal, selected, openOrderDesign, ar, t, money, go } = useApp();
  if (!selected) return null;
  return (
    <>
      <>
        <Heading>{selected.id}</Heading>
        <StatusBadge status={selected.status} />
        <p>
          {selected.customer} · {selected.product}
        </p>
        <div className="selling-total">
          <span>{t('قيمة الطلب', 'Selling total')}</span>
          <strong>{money(selected.grandTotal)} EGP</strong>
        </div>
        <p className="muted">
          {t('المدفوع', 'Paid')}: {money(selected.paid)} EGP · {t('المتبقي', 'Balance')}: {money(Math.max(0, selected.grandTotal - selected.paid))} EGP
        </p>
        <div className="order-timeline">
          {['draft', 'confirmed', 'production', 'ready', 'delivered'].map((s) => (
            <div key={s} className={s === selected.status ? 'current' : ''}>
              <span />
              {statusLabels[s]?.[ar ? 0 : 1]}
            </div>
          ))}
        </div>
        <div className="toolbar">
          <Button
            variant="primary"
            onClick={() => {
              openOrderDesign(selected);
              setModal('');
              go('preview');
            }}
          >
            <Icon name="eye" />
            {t('معاينة التصميم', 'Design preview')}
          </Button>
          <Button
            onClick={() => {
              setModal('');
              go('finance');
            }}
          >
            {t('الفاتورة والمدفوعات', 'Invoice & payments')}
          </Button>
        </div>
        {selected.status !== 'draft' && (
          <Button onClick={() => setModal('revision')}>{t('طلب تعديل', 'Request revision')}</Button>
        )}
      </>
    </>
  );
}
