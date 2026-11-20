import { useApp } from '@/fos/context/AppContext';
import { Input, Select, Option, Heading } from '@/fos/components/ui';
import OrderTable from '@/fos/components/shared/OrderTable';
import { statusLabels } from '@/fos/data/statusLabels';

export default function SalesPage() {
  const { orders, search, setSearch, filter, setFilter, ar, t } = useApp();
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <Heading>
            {t('كل الطلبات', 'All orders')} <span className="counter">{orders.length}</span>
          </Heading>
          <div className="toolbar">
            <Input
              placeholder={t('البحث في الطلبات...', 'Search orders...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <Option value="all">{t('كل الحالات', 'All statuses')}</Option>
              {Object.keys(statusLabels)
                .slice(0, 5)
                .map((s) => (
                  <Option key={s} value={s}>
                    {statusLabels[s][ar ? 0 : 1]}
                  </Option>
                ))}
            </Select>
          </div>
        </div>
        <OrderTable />
        <div className="panel-footer">
          {t('بيانات المصنع الحالي فقط', 'Current factory only')}
        </div>
      </section>
    </>
  );
}
