import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';

export default function SupportPage() {
  const { support, setSupport, setSupportUntil, t, record } = useApp();
  return (
    <>
      <section className="panel settings-card">
        <Heading>{t('الوصول المؤقت للدعم', 'Temporary support access')}</Heading>
        <p>
          {t(
            'المصنع: الأصيل · النطاق: تشخيص مشكلة المزامنة · المدة: ١٥ دقيقة',
            'Factory: Al Aseel · Scope: Sync diagnostics · Duration: 15 minutes',
          )}
        </p>
        <StatusBadge status={support === 'none' ? 'draft' : support} />
        <Button
          variant="primary"
          disabled={['pending', 'approved', 'active'].includes(support)}
          onClick={() => {
            setSupport('pending');
            record('Support requested · manager approval required');
          }}
        >
          {t('طلب موافقة مدير المصنع', 'Request manager approval')}
        </Button>
        {support === 'approved' && (
          <Button
            onClick={() => {
              setSupport('active');
              setSupportUntil(Date.now() + 15 * 60 * 1000);
              record('Approved support scope activated');
            }}
          >
            {t('تفعيل الوصول المعتمد', 'Activate approved access')}
          </Button>
        )}
        <p className="muted">
          {t(
            'انتقل إلى إعدادات واجهة المدير للموافقة. لا يُمنح الوصول تلقائيًا.',
            'Switch to Manager Settings to approve. Access is never granted automatically.',
          )}
        </p>
      </section>
    </>
  );
}
