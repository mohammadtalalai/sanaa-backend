import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import { cashSince, closeShift, fetchOpenShift, openShift } from '@/fos/lib/cloud';

export default function ShiftPage() {
  const { setModal, counted, setCounted, t, money, userId, record, notify, fail } = useApp();
  const queryClient = useQueryClient();
  const shift = useQuery({ queryKey: ['fos', 'shift', userId], queryFn: () => fetchOpenShift(userId) });
  const s = shift.data as any;
  const open = s && !s.closed_at;
  const cash = useQuery({ queryKey: ['fos', 'shift-cash', s?.id], queryFn: () => cashSince(userId, s.opened_at), enabled: Boolean(open) });
  const received = open ? (cash.data ?? 0) : Number(s?.cash_received ?? 0);
  const expected = Number(s?.opening_cash ?? 0) + received;

  useEffect(() => {
    const onClose = async () => {
      try {
        await closeShift(s.id, +counted);
        record(`Shift closed · counted ${counted} EGP · expected ${expected} EGP`);
        notify('تم إغلاق الوردية', 'Shift closed');
        setCounted('');
        await queryClient.invalidateQueries({ queryKey: ['fos', 'shift'] });
      } catch (e) {
        fail(e);
      }
    };
    window.addEventListener('fos-close-shift', onClose);
    return () => window.removeEventListener('fos-close-shift', onClose);
  }, [s, counted, expected]);

  return (
    <section className="panel settings-card">
      <Heading>{t('وردية اليوم', 'Today’s shift')}</Heading>
      <StatusBadge status={open ? 'active' : 'confirmed'} />
      {!open && (
        <>
          <p>{s ? t('آخر وردية مغلقة. افتح وردية جديدة لبدء العمل.', 'Last shift is closed. Open a new shift to start.') : t('لا توجد وردية مفتوحة.', 'No open shift.')}</p>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await openShift(userId);
                record('Shift opened');
                await queryClient.invalidateQueries({ queryKey: ['fos', 'shift'] });
              } catch (e) {
                fail(e);
              }
            }}
          >
            {t('فتح وردية', 'Open shift')}
          </Button>
        </>
      )}
      {s && (
        <>
          <div className="record-row">
            <span>{t('النقدية الافتتاحية', 'Opening cash')}</span>
            <strong>{money(Number(s.opening_cash))} EGP</strong>
          </div>
          <div className="record-row">
            <span>{t('النقدية المستلمة', 'Cash received')}</span>
            <strong>{money(received)} EGP</strong>
          </div>
          <div className="record-row">
            <span>{t('النقدية المتوقعة', 'Expected cash')}</span>
            <strong>{money(expected)} EGP</strong>
          </div>
        </>
      )}
      {open && (
        <>
          <div className="field">
            <span>{t('النقدية المعدودة', 'Counted cash')}</span>
            <Input type="number" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} />
          </div>
          {counted && (
            <p>
              {t('الفرق', 'Difference')}: {money(+counted - expected)} EGP
            </p>
          )}
          <Button variant="primary" disabled={!counted || +counted < 0} onClick={() => setModal('shift-confirm')}>
            {t('إغلاق الوردية', 'Close shift')}
          </Button>
        </>
      )}
      {s?.closed_at && (
        <p className="muted">
          {t('أُغلقت', 'Closed')} {new Date(s.closed_at).toLocaleString()} · {t('المعدود', 'Counted')} {money(Number(s.counted_cash ?? 0))} EGP
        </p>
      )}
    </section>
  );
}
