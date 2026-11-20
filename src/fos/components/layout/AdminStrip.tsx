import { useApp } from '@/fos/context/AppContext';

export default function AdminStrip() {
  const { system, t } = useApp();
  return (
    <>
      {system === 'admin' && (
        <div className="admin-strip">
          ADMIN CONSOLE{' '}
          <span>{t('وحدة تحكم المنصة', 'Platform administration')}</span>
        </div>
      )}
    </>
  );
}
