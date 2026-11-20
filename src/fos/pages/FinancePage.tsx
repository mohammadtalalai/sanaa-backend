import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Select, Option, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import Icon from '@/fos/components/Icon';

export default function FinancePage() {
  const { orders, setModal, selected, setSelected, counted, setCounted, t, money, go, ordersLoading } = useApp();
  const order = (selected && orders.find((o) => o.dbId === selected.dbId)) || selected || orders.find((o) => o.status !== 'draft') || orders[0];
  if (!order) {
    return <div className="empty">{ordersLoading ? t('جارٍ التحميل...', 'Loading...') : t('لا توجد طلبات بعد', 'No orders yet')}</div>;
  }
  const vat = order.grandTotal - order.total;
  const balance = Math.max(0, order.grandTotal - order.paid);
  return (
    <div className="finance-grid">
      <section className="panel">
        <div className="panel-heading">
          <Heading>{t('الفواتير والمدفوعات', 'Invoices & payments')}</Heading>
          <Select aria-label="Order" value={String(order.dbId)} onChange={(e) => setSelected(orders.find((o) => o.dbId === +e.target.value) ?? null)}>
            {orders.filter((o) => o.status !== 'cancelled').slice(0, 100).map((o) => (
              <Option key={o.dbId} value={String(o.dbId)}>
                {o.id} · {o.customer}
              </Option>
            ))}
          </Select>
          <StatusBadge status={order.invoiceLocked ? 'confirmed' : 'draft'} />
        </div>
        <div className="invoice-content">
          <div className="invoice-brand">
            صنعة SANAA <small>INV-{order.id}</small>
          </div>
          <p>
            {order.customer} {order.phone && <span dir="ltr">· {order.phone}</span>}
          </p>
          <div className="record-row">
            <strong>{order.product}</strong>
            <span>{money(order.total)} EGP</span>
          </div>
          <div className="record-row">
            <span>
              {t('ضريبة القيمة المضافة', 'VAT')} ({order.vatPct}%)
            </span>
            <span>{money(vat)} EGP</span>
          </div>
          <div className="selling-total">
            <strong>{t('الإجمالي شامل الضريبة', 'Total including tax')}</strong>
            <strong>{money(order.grandTotal)} EGP</strong>
          </div>
          <details open={!order.invoiceLocked}>
            <summary>{t('بيانات الفاتورة الإلكترونية', 'E-invoice details')}</summary>
            <Input
              placeholder={t('الرقم الضريبي للعميل', 'Customer tax ID')}
              disabled={order.invoiceLocked}
              value={order.invoiceLocked ? order.taxId : counted}
              maxLength={30}
              onChange={(e) => setCounted(e.target.value)}
            />
          </details>
          <div className="toolbar">
            <Button
              variant="primary"
              disabled={order.status === 'draft'}
              onClick={() => {
                setSelected(order);
                setModal(order.invoiceLocked ? 'revision' : 'invoice-confirm');
              }}
            >
              {order.invoiceLocked ? t('طلب تصحيح / عكس', 'Request correction / reversal') : t('تأكيد الفاتورة', 'Confirm invoice')}
            </Button>
            <Button onClick={() => { setSelected(order); go('documents'); }}>
              <Icon name="file" />
              {t('معاينة الطباعة', 'Print preview')}
            </Button>
          </div>
          {order.status === 'draft' && <small>{t('أكّد الطلب أولاً قبل إصدار الفاتورة.', 'Confirm the order before issuing the invoice.')}</small>}
        </div>
      </section>
      <section className="panel payment-card">
        <Heading>{t('رصيد العميل', 'Customer balance')}</Heading>
        <strong className="balance">
          {money(balance)} <small>EGP</small>
        </strong>
        <p>{t('المبلغ المتبقي شامل الضريبة', 'Remaining balance including tax')}</p>
        <div className="payment-progress">
          <span style={{ width: `${Math.min(100, (order.paid / Math.max(1, order.grandTotal)) * 100)}%` }} />
        </div>
        <p className="muted">
          {t('المدفوع', 'Paid')}: {money(order.paid)} EGP
        </p>
        <Button variant="primary" disabled={balance <= 0} onClick={() => { setSelected(order); setModal('payment'); }}>
          <Icon name="plus" />
          {t('تسجيل دفعة', 'Record payment')}
        </Button>
      </section>
    </div>
  );
}
