import type { System } from '@/fos/types';
import { useApp } from '@/fos/context/AppContext';
import { Select, Option } from '@/fos/components/ui';

/** Lets people with more than one role switch workspace. Only roles the account really has are offered. */
export default function SystemPicker() {
  const { system, setSystem, setSelected, allowedSystems, t, go } = useApp();
  if (allowedSystems.length < 2) return null;
  const labels: Record<System, string> = {
    manager: t('مدير المصنع', 'Manager portal'),
    employee: t('موظف المبيعات', 'Employee app'),
    admin: t('إدارة المنصة', 'Admin console'),
  };
  return (
    <div className="system-picker">
      <span>{t('الواجهة', 'Workspace')}</span>
      <Select
        aria-label="Select system"
        value={system}
        onChange={(e) => {
          setSystem(e.target.value as System);
          go('dashboard');
          setSelected(null);
        }}
      >
        {allowedSystems.map((s) => (
          <Option key={s} value={s}>{labels[s]}</Option>
        ))}
      </Select>
    </div>
  );
}
