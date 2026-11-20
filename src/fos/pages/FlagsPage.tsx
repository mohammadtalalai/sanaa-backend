import { useApp } from '@/fos/context/AppContext';
import { Button } from '@/fos/components/ui';

export default function FlagsPage() {
  const { flagRows, toggleFlag, roles, t } = useApp();
  const admin = roles.includes('admin');
  return (
    <section className="panel">
      {flagRows.map((f: any, i: number) => (
        <div className="record-row" key={f.key}>
          <strong>{f.name}</strong>
          <span>Global · {f.enabled ? '100' : '0'}%</span>
          <Button variant={f.enabled ? 'primary' : ''} disabled={!admin} onClick={() => toggleFlag(i)}>
            {f.enabled ? t('مفعّل', 'Enabled') : t('معطّل', 'Disabled')}
          </Button>
        </div>
      ))}
    </section>
  );
}
