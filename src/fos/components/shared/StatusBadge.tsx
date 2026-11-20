import { useApp } from '@/fos/context/AppContext';
import { statusLabels } from '@/fos/data/statusLabels';

export default function StatusBadge({ status }: { status: string }) {
  const { ar } = useApp();
  return (
    <>
      <span className={`badge ${status}`}>
        <span className="status-dot" />
        {statusLabels[status]?.[ar ? 0 : 1] || status}
      </span>
    </>
  );
}
