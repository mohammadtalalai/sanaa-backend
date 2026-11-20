import { useApp } from '@/fos/context/AppContext';
import { Heading } from '@/fos/components/ui';

export default function PermissionsPage() {
  const { t } = useApp();
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <Heading>{t('مصفوفة الصلاحيات', 'Permission matrix')}</Heading>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('القدرة', 'Capability')}</th>
                <th>Admin</th>
                <th>Manager</th>
                <th>Employee</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['إدارة المصانع والخطط', 'Manage factories and plans', 'Yes', 'No', 'No'],
                [
                  'بيانات أعمال المصنع',
                  'Factory business data',
                  'Approval required',
                  'Own factory',
                  'Own sales only',
                ],
                ['التكلفة والهامش', 'Cost & margin', 'No', 'Field permission', 'Never'],
                ['المساعد الذكي', 'AI assistant', 'Governance only', 'Own factory', 'Never'],
                ['الطلبات والفواتير', 'Orders & invoices', 'No', 'Yes', 'Own records'],
                ['اعتماد التعديلات', 'Approve revisions', 'No', 'Yes', 'Request only'],
              ].map((r) => (
                <tr key={r[0]}>
                  <td>{t(r[0], r[1])}</td>
                  {r.slice(2).map((c, i) => (
                    <td key={i}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-footer">
          {t(
            'تُطبَّق هذه الصلاحيات في قاعدة البيانات والخادم، وليس في الواجهة فقط.',
            'These permissions are enforced by the database and the server, not only in the screens.',
          )}
        </div>
      </section>
    </>
  );
}
