import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import Icon from '@/fos/components/Icon';

export default function TenantsPage() {
  const { search, setSearch, setModal, tenantRows, setCounted, t } = useApp();
  return (
    <section className="panel">
      <div className="panel-heading">
        <Heading>{t('دليل المصانع', 'Factory directory')}</Heading>
        <Input placeholder={t('البحث عن مصنع', 'Search factories')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {tenantRows
        .filter((n: any) => n.name.includes(search))
        .map((n: any) => (
          <Button variant="record-row" key={n.id} onClick={() => { setCounted(n.name); setModal('tenant'); }}>
            <span className="factory-avatar">
              <Icon name="factory" />
            </span>
            <strong>{n.name}</strong>
            <span>{n.plan}</span>
            <span>
              {n.users_count} users · {n.branches_count} branches
            </span>
            <StatusBadge status={n.status} />
            <Icon name="arrow" size={16} />
          </Button>
        ))}
    </section>
  );
}
