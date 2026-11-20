import { useApp } from '@/fos/context/AppContext';
import { Button, Input, Heading } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';

export default function RecordListPage() {
  const { page, search, setSearch, setModal, setCounted, t, title, records, recordsLoading } = useApp();
  const rows = (records[page] ?? []).filter((row) => row.join(' ').toLowerCase().includes(search.toLowerCase()));
  return (
    <section className="panel">
      <div className="panel-heading">
        <Heading>
          {title} <span className="counter">{records[page]?.length ?? 0}</span>
        </Heading>
        <Input placeholder={t('بحث...', 'Search...')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="record-list">
        {recordsLoading && <div className="empty">{t('جارٍ التحميل...', 'Loading...')}</div>}
        {!recordsLoading && !rows.length && <div className="empty">{t('لا توجد سجلات', 'No records')}</div>}
        {rows.map((row, i) => (
          <Button variant="record-row" key={`${row[0]}-${i}`} onClick={() => { setModal('record'); setCounted(row.join(' · ')); }}>
            <span className="record-code">{row[0]}</span>
            <strong>{row[1]}</strong>
            <span className="muted">{row[2]}</span>
            <span className="badge">{row[3]}</span>
            <Icon name="arrow" size={16} />
          </Button>
        ))}
      </div>
    </section>
  );
}
