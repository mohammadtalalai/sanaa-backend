import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Heading } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';

export default function CustomersPage() {
  const { search, setSearch, setModal, customers, setDraftCustomerId, t, newOrder } = useApp();
  const list = customers.filter((c) => `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <section className="panel">
      <div className="panel-heading">
        <Heading>
          {t('عملاء المصنع', 'Factory customers')} <span className="counter">{customers.length}</span>
        </Heading>
        <Button variant="primary" onClick={() => setModal('customer')}>
          <Icon name="plus" />
          {t('إضافة عميل', 'Add customer')}
        </Button>
      </div>
      <Input placeholder={t('بحث بالاسم أو الهاتف', 'Search name or phone')} value={search} onChange={(e) => setSearch(e.target.value)} />
      {!list.length && <div className="empty">{t('لا توجد نتائج مطابقة', 'No matching records')}</div>}
      {list.slice(0, 200).map((c) => (
        <Button
          key={c.id}
          variant="record-row"
          onClick={() => {
            newOrder();
            setDraftCustomerId(c.id);
          }}
        >
          <span className="customer-avatar">{c.name[0]}</span>
          <strong>{c.name}</strong>
          <span dir="ltr">{c.phone ?? ''}</span>
          <span>{t('إنشاء طلب لهذا العميل', 'Create an order for this customer')}</span>
          <Icon name="arrow" />
        </Button>
      ))}
    </section>
  );
}
