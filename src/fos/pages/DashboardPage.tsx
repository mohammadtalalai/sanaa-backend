import { useApp } from '@/fos/context/AppContext';
import { Button, Select, Option, Heading } from '@/fos/components/ui';
import StatusBadge from '@/fos/components/shared/StatusBadge';
import Metric from '@/fos/components/shared/Metric';
import OrderTable from '@/fos/components/shared/OrderTable';
import Icon from '@/fos/components/Icon';
import { statusLabels } from '@/fos/data/statusLabels';

function chartPath(values: number[], max: number, close = false) {
  if (!values.length) return '';
  const step = 700 / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, 195 - (v / (max || 1)) * 180]);
  let d = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = (x0 + x1) / 2;
    d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
  }
  return close ? `${d} L700 200 L0 200Z` : d;
}
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : 0);

export default function DashboardPage() {
  const { system, orders, approvals, tenantRows, setLocked, ar, t, money, go, dashboard, newOrder } = useApp();
  const d = (dashboard ?? {}) as Record<string, any>;
  const monthly: { month: string; revenue: number }[] = (d.monthly ?? []).map((m: any) => ({ month: m.month, revenue: Number(m.revenue) }));
  const last6 = monthly.slice(-6);
  const prev6 = monthly.slice(-12, -6);
  const max = Math.max(1, ...last6.map((m) => m.revenue), ...prev6.map((m) => m.revenue));
  const axisMax = Math.ceil(max / 1000) * 1000;
  const monthName = (iso: string) => new Date(iso).toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { month: 'short' });
  const sales = Number(d.month_sales ?? 0), prevSales = Number(d.prev_month_sales ?? 0);
  const salesTrend = pct(sales, prevSales);
  const statusCounts = ['production', 'confirmed', 'ready', 'draft'].map((s) => [s, orders.filter((o) => o.status === s).length] as const);
  const pending = approvals.filter((a) => a.status === 'pending').length;
  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  return (
    <>
      <div className="announcement">
        <div className="announcement-icon">
          <Icon name="spark" />
        </div>
        <div>
          <strong>{t('من الفكرة إلى قطعة أثاث. بكل وضوح.', 'From an idea to a beautiful piece. With clarity.')}</strong>
          <span>
            {t(
              'معاينة التصميم والعروض ثلاثية الأبعاد متاحة — شارك عملاءك تفاصيل طلبهم قبل التصنيع.',
              'Design previews and 3D quotations are live. Let customers see every detail before production.',
            )}
          </span>
        </div>
        <Button
          variant="text"
          onClick={() => {
            if (system === 'admin') go('announcements');
            else {
              setLocked(false);
              newOrder();
            }
          }}
        >
          {t('ابدأ طلباً', 'Start an order')}
          <Icon name="arrow" size={17} />
        </Button>
      </div>
      <div className="metrics">
        {system === 'admin' ? (
          <>
            <Metric icon={'factory'} label={t('المصانع النشطة', 'Active factories')} value={money(tenantRows.filter((x: any) => x.status === 'active').length)} trend={''} />
            <Metric icon={'users'} label={t('مستخدمو المنصة', 'Platform users')} value={money(tenantRows.reduce((n: number, x: any) => n + Number(x.users_count), 0))} trend={''} />
            <Metric icon={'wallet'} label={t('الخطط', 'Plans')} value={money(new Set(tenantRows.map((x: any) => x.plan)).size)} trend={''} />
            <Metric icon={'chart'} label={t('حالة النظام', 'System status')} value={t('يعمل', 'Online')} trend={''} />
          </>
        ) : (
          <>
            <Metric icon={'wallet'} label={t('مبيعات هذا الشهر', 'Sales this month')} value={money(sales) + ' ' + t('ج.م', 'EGP')}
              trend={`${Math.abs(salesTrend)}%`} down={salesTrend < 0} />
            <Metric icon={'bag'} label={t('الطلبات النشطة', 'Active orders')} value={money(Number(d.active_orders ?? 0))} trend={''} />
            <Metric icon={'factory'} label={t('طلبات قيد التصنيع', 'Orders in production')} value={money(Number(d.in_production ?? 0))} trend={''} />
            <Metric icon={'truck'} label={t('جاهز للتسليم', 'Ready for delivery')} value={money(Number(d.ready ?? 0))} trend={''} />
          </>
        )}
      </div>
      {system !== 'admin' && (
        <div className="dashboard-grid">
          <section className="panel revenue">
            <div className="panel-heading">
              <div>
                <Heading>{t('نظرة على المبيعات', 'Sales overview')}</Heading>
                <p>{t('صافي المبيعات المؤكدة خلال الأشهر الستة الماضية', 'Confirmed net sales over the last six months')}</p>
              </div>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-walnut" />
                {t('المبيعات', 'Revenue')}
              </span>
              <span>
                <i className="legend-oak" />
                {t('الفترة السابقة', 'Previous period')}
              </span>
              <strong>
                {money(last6.reduce((n, m) => n + m.revenue, 0))} <small>{t('ج.م', 'EGP')}</small>
              </strong>
            </div>
            <div className="chart">
              <div className="axis">
                {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                  <span key={f}>{k(axisMax * f)}</span>
                ))}
              </div>
              <svg viewBox="0 0 700 200" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity=".16" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[10, 55, 100, 145, 190].map((y) => (
                  <line key={y} x1="0" y1={y} x2="700" y2={y} stroke="var(--border)" strokeDasharray="4 5" />
                ))}
                <path d={chartPath(last6.map((m) => m.revenue), axisMax, true)} fill="url(#area)" />
                <path d={chartPath(prev6.map((m) => m.revenue), axisMax)} fill="none" stroke="var(--oak)" strokeWidth="2" strokeDasharray="6 6" />
                <path d={chartPath(last6.map((m) => m.revenue), axisMax)} fill="none" stroke="var(--primary)" strokeWidth="3" />
              </svg>
            </div>
            <div className="chart-months">
              {last6.map((m) => (
                <span key={m.month}>{monthName(m.month)}</span>
              ))}
            </div>
          </section>
          <section className="panel distribution">
            <div className="panel-heading">
              <Heading>{t('حالة الطلبات', 'Order status')}</Heading>
              <Button variant="icon" aria-label="View orders" onClick={() => go('sales')}>
                <Icon name="more" />
              </Button>
            </div>
            <div className="donut">
              <div>
                <strong>{money(orders.length)}</strong>
                <span>{t('إجمالي الطلبات', 'Total orders')}</span>
              </div>
            </div>
            <div className="donut-legend">
              {statusCounts.map(([s, n]) => (
                <div key={s}>
                  <span>
                    <i className={`dot ${s}`} />
                    {statusLabels[s]?.[ar ? 0 : 1]}
                  </span>
                  <strong>{money(Number(n))}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      <div className="dashboard-lower">
        <section className="panel orders-panel">
          <div className="panel-heading">
            <div>
              <Heading>{system === 'admin' ? t('المصانع الحديثة', 'Recent factories') : t('أحدث الطلبات', 'Recent orders')}</Heading>
              <p>{t('متابعة التفاصيل التي تصنع الفارق', 'Stay close to the details that matter')}</p>
            </div>
            <Button variant="text" onClick={() => go(system === 'admin' ? 'tenants' : 'sales')}>
              {t('عرض الكل', 'View all')}
              <Icon name="arrow" size={16} />
            </Button>
          </div>
          {system === 'admin' ? (
            <div className="record-list">
              {tenantRows.slice(0, 5).map((n: any) => (
                <div className="record-row" key={n.id}>
                  <span className="factory-avatar">
                    <Icon name="factory" />
                  </span>
                  <strong>{n.name}</strong>
                  <span>
                    {n.plan} · {n.users_count} users
                  </span>
                  <StatusBadge status={n.status} />
                </div>
              ))}
            </div>
          ) : (
            <OrderTable limit={5} />
          )}
        </section>
        <section className="panel activity">
          <div className="panel-heading">
            <Heading>{t('يحتاج انتباهك', 'Needs your attention')}</Heading>
            <span className="counter">{pending + (Number(d.low_stock ?? 0) > 0 ? 1 : 0) + (Number(d.payments_due ?? 0) > 0 ? 1 : 0)}</span>
          </div>
          <Button variant="attention" onClick={() => go(system === 'admin' ? 'support' : 'approvals')}>
            <span className="attention-icon amber">
              <Icon name="check" />
            </span>
            <span>
              <strong>{t('موافقات بانتظارك', 'Approvals waiting')}</strong>
              <small>{t('طلبات تحتاج قرارك للمتابعة', 'Requests need your decision')}</small>
            </span>
            <span className="counter">{pending}</span>
          </Button>
          {system !== 'admin' && (
            <>
              <Button variant="attention" onClick={() => go(system === 'employee' ? 'sales' : 'inventory')}>
                <span className="attention-icon red">
                  <Icon name="box" />
                </span>
                <span>
                  <strong>{t('مخزون يحتاج إعادة طلب', 'Stock needs reordering')}</strong>
                  <small>
                    {Number(d.low_stock ?? 0)} {t('خامات', 'materials')}
                    {d.low_stock_first_ar ? ` · ${ar ? d.low_stock_first_ar : d.low_stock_first_en}` : ''}
                  </small>
                </span>
                <Icon name="arrow" size={16} />
              </Button>
              <Button variant="attention" onClick={() => go('finance')}>
                <span className="attention-icon green">
                  <Icon name="wallet" />
                </span>
                <span>
                  <strong>{t('دفعات مستحقة', 'Payments due')}</strong>
                  <small>
                    {money(Number(d.payments_due ?? 0))} {t('ج.م', 'EGP')} · {Number(d.payments_due_customers ?? 0)} {t('عملاء', 'customers')}
                  </small>
                </span>
                <Icon name="arrow" size={16} />
              </Button>
            </>
          )}
          <div className="activity-footer">
            <span className="live-dot" />
            {t('بيانات مباشرة من النظام', 'Live data')}
          </div>
        </section>
      </div>
      {system !== 'admin' && (
        <div className="bottom-insight">
          <Icon name="spark" size={18} />
          <span>
            {salesTrend >= 0
              ? t(`مبيعات هذا الشهر حتى الآن أعلى بنسبة ${salesTrend}٪ من الشهر الماضي كاملاً.`, `Sales so far this month are ${salesTrend}% above all of last month.`)
              : t(`مبيعات هذا الشهر حتى الآن أقل بنسبة ${Math.abs(salesTrend)}٪ من الشهر الماضي كاملاً (الشهر لم يكتمل بعد).`,
                  `Sales so far this month are ${Math.abs(salesTrend)}% below all of last month (the month is not over yet).`)}
          </span>
          <Button variant="text" onClick={() => go(system === 'employee' ? 'sales' : 'ai')}>
            {t('استكشف التفاصيل', 'Explore insights')}
            <Icon name="arrow" size={15} />
          </Button>
        </div>
      )}
    </>
  );
}
