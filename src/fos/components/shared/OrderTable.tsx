import { useApp } from '@/fos/context/AppContext';
import { Button } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import Icon from '@/fos/components/Icon';

export default function OrderTable({ limit }: { limit?: number }) {
  const { orders, search, filter, setModal, setSelected, setLocked, t, money } = useApp();
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                t('رقم الطلب', 'Order'),
                t('العميل', 'Customer'),
                t('المنتج', 'Product'),
                t('التاريخ', 'Date'),
                t('القيمة', 'Value'),
                t('الحالة', 'Status'),
                '',
              ].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders
              .filter(
                (o) =>
                  (filter === 'all' || o.status === filter) &&
                  `${o.id} ${o.customer} ${o.product}`.toLowerCase().includes(search.toLowerCase()),
              )
              .slice(0, limit)
              .map((o) => (
                <tr
                  key={o.id}
                  onClick={() => {
                    setSelected(o);
                    setLocked(o.status !== 'draft');
                    setModal('order');
                  }}
                >
                  <td className="order-id">{o.id}</td>
                  <td>
                    <span className="customer-avatar">{o.customer[0]}</span>
                    {o.customer}
                  </td>
                  <td>{o.product}</td>
                  <td className="muted">{o.date}</td>
                  <td className="money">
                    {money(o.total)} <small>{t('ج.م', 'EGP')}</small>
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td>
                    <Button
                      variant="icon"
                      aria-label={t('فتح الطلب', 'Open order')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(o);
                        setLocked(o.status !== 'draft');
                        setModal('order');
                      }}
                    >
                      <Icon name="more" />
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!orders.filter((o) => (filter === 'all' || o.status === filter) && `${o.id} ${o.customer} ${o.product}`.toLowerCase().includes(search.toLowerCase())).length && (
          <div className="empty">{t('لا توجد نتائج مطابقة', 'No matching records')}</div>
        )}
      </div>
    </>
  );
}
