import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';

export default function ConfirmModal() {
  const { setModal, selected, t, money, total, saveOrder, policy, busy } = useApp();
  return (
    <>
      <>
        <div className="dialog-symbol">
          <Icon name="shield" size={32} />
        </div>
        <Heading>{t('هل نبدأ صناعة فكرتك؟', 'Ready to bring your idea to life?')}</Heading>
        <p>
          {t(
            'سيُقفل الطلب بعد التأكيد. أي تعديل لاحق يتطلب طلب مراجعة وموافقة المدير.',
            'Confirmation locks this order. Future changes require a revision request approved by your manager.',
          )}
        </p>
        <div className="selling-total">
          <span>{selected?.id || t('طلب جديد', 'New order')}</span>
          <strong>{money(total * (1 + policy.tax / 100))} EGP</strong>
        </div>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            await saveOrder(true);
            setModal('');
          }}
        >
          {t('تأكيد الطلب وقفل التصميم', 'Confirm order & lock design')}
        </Button>
      </>
    </>
  );
}
