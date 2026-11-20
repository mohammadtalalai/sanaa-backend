import { useApp } from '@/fos/context/AppContext';

export default function Footer() {
  const { t } = useApp();
  return (
    <>
      <footer className="main-footer">
        <span>
          صنعة SANAA <span>·</span> {t('صناعة أفضل، كل يوم.', 'Better made, every day.')}
        </span>
        <div>
          <span className="live-dot" />
          {t('جميع الأنظمة تعمل', 'All systems operational')}
        </div>
      </footer>
    </>
  );
}
