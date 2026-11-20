import { useApp } from '@/fos/context/AppContext';
import Icon from '@/fos/components/Icon';

export default function Metric({
  icon,
  label,
  value,
  trend,
  down = false,
}: {
  icon: string;
  label: string;
  value: string;
  trend: string;
  down?: boolean;
}) {
  const { t } = useApp();
  return (
    <>
      <div className="metric">
        <div className="metric-top">
          <span>{label}</span>
          <span className="metric-icon">
            <Icon name={icon} />
          </span>
        </div>
        <div className="metric-value">
          {value}
          {trend && (
            <span className={`trend ${down ? 'warning' : ''}`}>
              {down ? '↘' : '↗'} {trend}
            </span>
          )}
        </div>
        <div className="metric-foot">
          {trend ? t('مقارنة بالشهر الماضي', 'vs. last month') : ''}
          <svg viewBox="0 0 100 28">
            <path d="M0 24L10 20 20 23 30 12 40 17 50 8 60 12 70 6 80 9 90 3 100 5" />
          </svg>
        </div>
      </div>
    </>
  );
}
