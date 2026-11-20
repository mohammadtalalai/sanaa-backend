import { useApp } from '@/fos/context/AppContext';
import { Button, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import Icon from '@/fos/components/Icon';

export default function ApprovalsPage() {
  const { system, setModal, approvals, setCounted, t } = useApp();
  return (
    <div className="approval-grid">
      {!approvals.length && <div className="empty">{t('لا توجد طلبات موافقة', 'No approval requests')}</div>}
      {approvals.map((a) => (
        <section className="panel approval-card" key={a.id}>
          <div className="panel-heading">
            <span className="record-code">{a.id}</span>
            <StatusBadge status={a.status} />
          </div>
          <Heading>{a.title}</Heading>
          <p>{a.reason}</p>
          <div className="muted">
            {a.requester} · {a.created}
          </div>
          {a.status === 'pending' && system === 'manager' && (
            <div className="toolbar">
              <Button variant="primary" onClick={() => { setCounted(a.id); setModal('approve'); }}>
                <Icon name="check" />
                {t('موافقة', 'Approve')}
              </Button>
              <Button onClick={() => { setCounted(a.id); setModal('reject'); }}>{t('رفض', 'Reject')}</Button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
