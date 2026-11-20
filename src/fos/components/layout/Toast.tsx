import { useApp } from '@/fos/context/AppContext';
import { Button } from '@/fos/components/ui';
import Icon from '@/fos/components/Icon';

export default function Toast() {
  const { toast, setToast } = useApp();
  return (
    <>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
          <Button variant="icon" aria-label="Dismiss" onClick={() => setToast('')}>
            <Icon name="close" size={16} />
          </Button>
        </div>
      )}
    </>
  );
}
