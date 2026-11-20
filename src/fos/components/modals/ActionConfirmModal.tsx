import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';

export default function ActionConfirmModal() {
  const { modal, setModal, selected, orders, counted, t, confirmInvoice, busy } = useApp();
  const order = selected ?? orders[0];
  return (
    <>
      <Heading>{t('تأكيد الإجراء', 'Confirm action')}</Heading>
      <p>
        {t('بعد التأكيد سيصبح السجل مقفلاً ولا يمكن تعديله مباشرة.', 'After confirmation this record is locked and cannot be edited directly.')}
      </p>
      <Button
        variant="primary"
        disabled={busy}
        onClick={async () => {
          if (modal === 'invoice-confirm' && order) {
            if (await confirmInvoice(order, counted)) setModal('');
          } else {
            window.dispatchEvent(new CustomEvent('fos-close-shift'));
            setModal('');
          }
        }}
      >
        {t('تأكيد', 'Confirm')}
      </Button>
    </>
  );
}
