import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/fos/context/AppContext';
import { Heading } from '@/fos/components/ui';
import { fetchRecords } from '@/fos/lib/cloud';

export default function TeamModal() {
  const { t, ar } = useApp();
  const team = useQuery({ queryKey: ['fos', 'team'], queryFn: () => fetchRecords('users', ar) });
  return (
    <>
      <Heading>{t('الفريق والأدوار', 'Team & roles')}</Heading>
      {(team.data ?? []).map((r) => (
        <div className="record-row" key={r[0]}>
          <strong>{r[1] || r[2]}</strong>
          <span>{r[2]}</span>
          <span className="badge">{r[3]}</span>
        </div>
      ))}
      <p>
        {t(
          'كل حساب جديد يبدأ بدور موظف. أول حساب يحصل على كل الأدوار.',
          'Every new account starts as an employee. The first account gets every role.',
        )}
      </p>
    </>
  );
}
