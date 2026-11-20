import { useApp } from '@/fos/context/AppContext';
import { Button } from '@/fos/components/ui';

export default function Notices() {
  const { support, setSupport, supportUntil, tick, offline, t, record } = useApp();
  return (
    <>
      {offline && (
        <div className="notice">
          {t(
            'حُفظت المسودة على هذا الجهاز وستتم المزامنة عند الاتصال.',
            'Draft saved locally. Sync pending until you reconnect.',
          )}
        </div>
      )}
      {support === 'active' && (
        <div className="notice danger">
          {t('تصفح مؤقت بإذن المدير', 'Temporary manager-approved support access')} ·{' '}
          {Math.max(0, Math.ceil((supportUntil - tick) / 1000))}s{' '}
          <Button
            onClick={() => {
              setSupport('revoked');
              record('Support access ended');
            }}
          >
            {t('إنهاء الوصول', 'End access')}
          </Button>
        </div>
      )}
    </>
  );
}
