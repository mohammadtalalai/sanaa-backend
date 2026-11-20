import { useApp } from '@/fos/context/AppContext';
import { Heading } from '@/fos/components/ui';

export default function AuditPage() {
  const { audit, t } = useApp();
  return (
    <section className="panel">
      <div className="panel-heading">
        <Heading>{t('سجل النشاط', 'Activity log')}</Heading>
      </div>
      {audit.length ? (
        audit.map((a, i) => (
          <div className="record-row" key={i}>
            {a}
          </div>
        ))
      ) : (
        <div className="empty">{t('لم تُسجّل إجراءات بعد', 'No actions recorded yet')}</div>
      )}
    </section>
  );
}
