import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Order, System } from '@/fos/types';
import { managerNav, adminNav, employeeNav } from '@/fos/data/navigation';
import { load } from '@/fos/lib/storage';
import * as cloud from '@/fos/lib/cloud';
import { CostCalculator } from '@/shared/costing';
import { getCatalog } from '@/shared/catalog';

/** Wizard swatches -> catalog wood / finish / colour. */
export const WOOD_OPTIONS = [
  { wood: 'walnut', finish: 'natural', color: 'natural', ar: 'جوز طبيعي', en: 'Natural walnut' },
  { wood: 'oak', finish: 'matte', color: 'natural', ar: 'أرو فاتح', en: 'Light oak' },
  { wood: 'mdf', finish: 'lacquer', color: 'white', ar: 'أبيض دافئ (دوكو)', en: 'Warm ivory (lacquer)' },
];
export const PRODUCT_KEYS = ['wardrobe', 'bed', 'dining_table', 'sofa', 'tv_unit', 'desk', 'chair'];

const SUPPORT_MINUTES = 15;

/** Whole app state. Business data lives in Lovable Cloud; only language and theme stay on this device. */
export function useAppState(page: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = getCatalog();
  const setPage = (p: string) => navigate({ to: '/$page', params: { page: p } });
  const sidebarScroll = useRef<HTMLDivElement>(null);

  // ---------- session ----------
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);
  const userId = session?.user.id ?? '';
  const loggedIn = Boolean(session);

  const profile = useQuery({
    queryKey: ['fos', 'me', userId],
    enabled: loggedIn,
    queryFn: async () => {
      const [p, r] = await Promise.all([
        cloud.sb.from('profiles').select('full_name, email').eq('id', userId).maybeSingle(),
        cloud.sb.from('user_roles').select('role').eq('user_id', userId),
      ]);
      return { name: p.data?.full_name || session?.user.email || '', email: p.data?.email ?? session?.user.email ?? '',
        roles: ((r.data ?? []) as { role: string }[]).map((x) => x.role) };
    },
  });
  const roles = profile.data?.roles ?? [];
  const userName = profile.data?.name ?? '';
  const allowedSystems: System[] = [
    ...(roles.includes('manager') ? (['manager'] as System[]) : []),
    ...(roles.includes('employee') || roles.includes('manager') ? (['employee'] as System[]) : []),
    ...(roles.includes('admin') ? (['admin'] as System[]) : []),
  ];

  // ---------- preferences ----------
  const [lang, setLang] = useState('ar'),
    [theme, setTheme] = useState('light'),
    [systemChoice, setSystem] = useState<System | null>(null);
  useEffect(() => {
    setLang(load('fos-lang', 'ar'));
    setTheme(load('fos-theme', 'light'));
    setSystem(load<System | null>('fos-system', null));
  }, []);
  useEffect(() => {
    localStorage.setItem('fos-lang', JSON.stringify(lang));
    localStorage.setItem('fos-theme', JSON.stringify(theme));
    if (systemChoice) localStorage.setItem('fos-system', JSON.stringify(systemChoice));
  }, [lang, theme, systemChoice]);
  const system: System =
    systemChoice && allowedSystems.includes(systemChoice) ? systemChoice : (allowedSystems[0] ?? 'employee');

  const ar = lang === 'ar',
    t = (a: string, e: string) => (ar ? a : e),
    nav = system === 'manager' ? managerNav : system === 'admin' ? adminNav : employeeNav;

  // ---------- data ----------
  const q = <T,>(key: string, fn: () => Promise<T>, enabled = true) =>
    useQuery({ queryKey: ['fos', key, userId, lang], queryFn: fn, enabled: loggedIn && enabled });
  const ordersQ = q('orders', () => cloud.fetchOrders(ar), system !== 'admin');
  const customersQ = q('customers', cloud.fetchCustomers, system !== 'admin');
  const approvalsQ = q('approvals', () => cloud.fetchApprovals(ar));
  const settingsQ = q('settings', cloud.fetchSettings);
  const tenantsQ = q('tenants', cloud.fetchTenants, system === 'admin');
  const flagsQ = q('flags', cloud.fetchFlags);
  const notificationsQ = q('notifications', cloud.fetchNotifications);
  const auditQ = q('audit', cloud.fetchAudit);
  const dashboardQ = q('dashboard', () => cloud.api('v1/dashboard'), system !== 'admin');
  const recordsQ = useQuery({
    queryKey: ['fos', 'records', page, userId, lang],
    queryFn: () => cloud.fetchRecords(page, ar),
    enabled: loggedIn && ['engineering', 'inventory', 'manufacturing', 'quality', 'users', 'billing', 'health', 'security', 'announcements'].includes(page),
  });
  const refresh = (...keys: string[]) =>
    Promise.all(keys.map((k) => queryClient.invalidateQueries({ queryKey: ['fos', k] })));

  const orders: Order[] = ordersQ.data ?? [];
  const customers = customersQ.data ?? [];
  const approvals = approvalsQ.data ?? [];
  const settings = settingsQ.data ?? null;
  const tenantRows = tenantsQ.data ?? [];
  const tenants: string[] = tenantRows.map((x: any) => x.name);
  const flagRows = flagsQ.data ?? [];
  const flags: boolean[] = flagRows.map((f: any) => Boolean(f.enabled));
  const notificationRows = notificationsQ.data ?? [];
  const notifications = notificationRows.filter((n: any) => !n.read).length;
  const audit = auditQ.data ?? [];
  const records: Record<string, string[][]> = { [page]: recordsQ.data ?? [] };
  const policy = { tax: Number(settings?.tax_pct ?? 14), discount: Number(settings?.employee_discount_limit ?? 5) };
  const support: string = settings?.support_status ?? 'none';
  const supportUntil = settings?.support_until ? new Date(settings.support_until).getTime() : 0;

  // ---------- UI state ----------
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState(''),
    [selected, setSelected] = useState<Order | null>(null);
  const [width, setWidth] = useState(200),
    [height, setHeight] = useState(220),
    [depth, setDepth] = useState(60),
    [doors, setDoors] = useState(3),
    [wood, setWood] = useState(0),
    [opened, setOpened] = useState(false),
    [view, setView] = useState('perspective'),
    [dimensions, setDimensions] = useState(true),
    [zoom, setZoom] = useState(1),
    [orbit, setOrbit] = useState(-24),
    [approvedDesign, setApprovedDesign] = useState(false),
    [locked, setLocked] = useState(false),
    [step, setStep] = useState(0),
    [draftCustomerId, setDraftCustomerId] = useState<number | null>(null),
    [productKey, setProductKey] = useState('wardrobe'),
    [notes, setNotes] = useState(''),
    [promisedDate, setPromisedDate] = useState(''),
    [counted, setCounted] = useState(''),
    [tick, setTick] = useState(Date.now()),
    [authStage, setAuthStage] = useState('login'),
    [signed, setSigned] = useState(false),
    [offline, setOffline] = useState(false),
    [busy, setBusy] = useState(false);

  const draftCustomer = customers.find((c) => c.id === draftCustomerId)?.name ?? customers[0]?.name ?? '';
  const setDraftCustomer = (name: string) => {
    const c = customers.find((x) => x.name === name);
    if (c) setDraftCustomerId(c.id);
  };
  useEffect(() => {
    if (draftCustomerId === null && customers[0]) setDraftCustomerId(customers[0].id);
  }, [customers, draftCustomerId]);
  const product = catalog.label('product_type', productKey, ar ? 'ar' : 'en');
  const setProduct = setProductKey;
  const productInfo = catalog.product(productKey);
  const limits = { min: productInfo.min_dims as number[], max: productInfo.max_dims as number[] };
  const dimsValid =
    width >= limits.min[0]! && width <= limits.max[0]! && depth >= limits.min[1]! && depth <= limits.max[1]! &&
    height >= limits.min[2]! && height <= limits.max[2]!;

  /** Piece price from the product price list (same rules as the customer chatbot). */
  const total = useMemo(() => {
    const w = WOOD_OPTIONS[wood]!;
    try {
      return new CostCalculator(catalog).quote({ product_type: productKey, width_cm: width, depth_cm: depth, height_cm: height,
        wood: w.wood, finish: w.finish, color: w.color, quantity: 1, city: 'Cairo' }).unit_price;
    } catch {
      return 0;
    }
  }, [productKey, width, depth, height, wood, catalog]);

  const money = (n: number) => new Intl.NumberFormat(ar ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 0 }).format(n);
  const title =
    nav.find((n) => n[0] === page)?.[ar ? 2 : 3] ||
    {
      preview: t('استوديو التصميم', 'Design studio'),
      wizard: t('طلب جديد', 'New order'),
      account: t('حسابي', 'My account'),
      documents: t('المستندات', 'Documents'),
      audit: t('سجل النشاط', 'Activity log'),
      permissions: t('الصلاحيات', 'Permissions'),
      notifications: t('الإشعارات', 'Notifications'),
      customers: t('العملاء', 'Customers'),
      finance: t('المالية', 'Finance'),
    }[page] ||
    page;

  function notify(a: string, e = 'Saved') {
    setToast(t(a, e));
  }
  function fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setToast(t('تعذّر الحفظ: ', 'Could not save: ') + message);
  }
  function record(text: string) {
    if (userId) cloud.writeAudit(text, userId, userName).then(() => refresh('audit'));
  }
  function go(p: string) {
    setPage(p);
    setSearch('');
    setFilter('all');
  }

  useEffect(() => {
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [lang, theme, ar]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  // ---------- actions ----------
  async function run(action: () => Promise<unknown>, keys: string[], ok?: [string, string]) {
    setBusy(true);
    try {
      await action();
      await refresh(...keys);
      if (ok) notify(ok[0], ok[1]);
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setSupport(status: string) {
    const until = status === 'active' ? new Date(Date.now() + SUPPORT_MINUTES * 60 * 1000).toISOString() : null;
    await run(() => cloud.saveSettings({ support_status: status, support_until: until }), ['settings']);
  }
  const setSupportUntil = (_: number) => undefined; // the end time is saved together with the 'active' status
  useEffect(() => {
    if (support === 'active' && supportUntil && tick >= supportUntil && roles.includes('manager')) {
      setSupport('expired');
      record('Support access expired');
    }
  }, [tick, support, supportUntil]);

  async function setPolicy(next: { tax: number; discount: number }) {
    await run(() => cloud.saveSettings({ tax_pct: next.tax, employee_discount_limit: next.discount }), ['settings']);
  }
  async function toggleFlag(i: number) {
    const f = flagRows[i];
    if (!f) return;
    await run(() => cloud.setFlag(f.key, !f.enabled), ['flags']);
    record(`Feature flag changed: ${f.name}`);
  }
  async function markAllRead() {
    await run(() => cloud.markNotifications(notificationRows.filter((n: any) => !n.read).map((n: any) => n.id)), ['notifications'],
      ['تم وضع علامة مقروء على الجميع', 'All marked read']);
  }
  async function markRead(id: number) {
    await run(() => cloud.markNotifications([id]), ['notifications']);
  }
  async function addCustomer(name: string, phone: string) {
    setBusy(true);
    try {
      const c = await cloud.addCustomer(name, phone, userId);
      await refresh('customers');
      setDraftCustomerId(c.id);
      record(`Customer added: ${name}`);
      notify('تمت إضافة العميل', 'Customer added');
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function addTenant(name: string, email: string, plan: string) {
    const ok = await run(() => cloud.addTenant(name, email, plan), ['tenants'], ['تم إنشاء المصنع', 'Factory created']);
    if (ok) record(`Factory created: ${name}`);
    return ok;
  }
  async function recordPayment(order: Order, amount: number, method: string) {
    const ok = await run(() => cloud.recordPayment(order.dbId, amount, method, userId), ['orders'], ['تم تسجيل الدفعة', 'Payment recorded']);
    if (ok) {
      setSelected({ ...order, paid: order.paid + amount });
      record(`Payment ${amount} EGP recorded on ${order.id}`);
    }
    return ok;
  }
  async function decide(approvalId: string, approved: boolean, note: string) {
    const a = approvals.find((x) => x.id === approvalId);
    if (!a) return false;
    const ok = await run(() => cloud.decideApproval(a.dbId, approved, note, userId), ['approvals'],
      approved ? ['تمت الموافقة', 'Approved'] : ['تم الرفض', 'Rejected']);
    if (ok) record(`Manager ${approved ? 'approved' : 'rejected'} ${approvalId} · ${note}`);
    return ok;
  }
  async function confirmInvoice(order: Order, taxId: string) {
    const ok = await run(() => cloud.confirmInvoice(order.dbId, taxId), ['orders'], ['تم تأكيد الفاتورة وقفلها', 'Invoice confirmed and locked']);
    if (ok) {
      setSelected({ ...order, invoiceLocked: true, taxId });
      record(`Invoice confirmed for ${order.id}`);
    }
    return ok;
  }
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setAuthStage('login');
  }

  function newOrder() {
    setLocked(false);
    setSelected(null);
    setApprovedDesign(false);
    setStep(0);
    setNotes('');
    setPromisedDate('');
    go('wizard');
  }
  /** Load an existing order into the design studio. */
  function openOrderDesign(order: Order) {
    const d = order.design ?? {};
    if (d.product_type && PRODUCT_KEYS.includes(d.product_type)) setProductKey(d.product_type);
    if (d.width_cm) setWidth(Number(d.width_cm));
    if (d.height_cm) setHeight(Number(d.height_cm));
    if (d.depth_cm) setDepth(Number(d.depth_cm));
    if (d.doors) setDoors(Number(d.doors));
    const w = WOOD_OPTIONS.findIndex((x) => x.wood === d.wood);
    if (w >= 0) setWood(w);
    if (order.customerId) setDraftCustomerId(order.customerId);
    setSelected(order);
    setLocked(order.status !== 'draft');
    setApprovedDesign(order.status !== 'draft');
  }
  async function saveOrder(confirm = false) {
    const customer = customers.find((c) => c.id === draftCustomerId) ?? customers[0];
    if (!customer) {
      notify('أضف عميلاً أولاً', 'Add a customer first');
      return;
    }
    if (!dimsValid) {
      notify('المقاسات خارج المسموح لهذا المنتج', 'Dimensions are outside the allowed range for this product');
      return;
    }
    setBusy(true);
    try {
      const w = WOOD_OPTIONS[wood]!;
      const prod = selected ? null : await cloud.productFor(productKey);
      const saved = await cloud.saveOrder({
        dbId: selected?.dbId, customerId: customer.id, productKey, productLabel: product, width, height, depth, doors,
        woodKey: w.wood, finishKey: w.finish, colorKey: w.color, unitPrice: total, vatPct: policy.tax, confirm, userId,
        notes, promisedDate, productId: prod?.id ?? null, costRatio: prod?.costRatio,
      });
      await refresh('orders', 'dashboard');
      const fresh = (await queryClient.fetchQuery({ queryKey: ['fos', 'orders', userId, lang], queryFn: () => cloud.fetchOrders(ar) }))
        .find((o) => o.dbId === saved.id);
      setSelected(fresh ?? null);
      setLocked(confirm);
      record(confirm ? `Order ${saved.order_no} confirmed and locked` : `Draft ${saved.order_no} saved`);
      notify(confirm ? 'تم تأكيد الطلب وقفل التصميم' : 'تم حفظ المسودة', confirm ? 'Order confirmed and locked' : 'Draft saved');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function request(reason: string) {
    const ok = await run(
      () => cloud.requestApproval(t('طلب تعديل', 'Revision request') + (selected ? ` · ${selected.id}` : ''), reason, selected?.dbId ?? null, userId, userName),
      ['approvals'], ['أُرسل الطلب إلى المدير', 'Request sent to manager'],
    );
    if (ok) record('Approval request submitted');
    return ok;
  }

  return {
    session, sessionReady, userId, userName, userEmail: profile.data?.email ?? '', roles, allowedSystems, profileReady: profile.isSuccess,
    lang, setLang, theme, setTheme, system, setSystem, page, setPage,
    orders, ordersLoading: ordersQ.isLoading, search, setSearch, filter, setFilter, toast, setToast, modal, setModal, selected, setSelected,
    approvals, tenants, tenantRows, customers, settings, dashboard: dashboardQ.data ?? null, records, recordsLoading: recordsQ.isLoading,
    width, setWidth, height, setHeight, depth, setDepth, doors, setDoors, wood, setWood, opened, setOpened, view, setView,
    dimensions, setDimensions, zoom, setZoom, orbit, setOrbit, approvedDesign, setApprovedDesign, locked, setLocked, step, setStep,
    draftCustomer, setDraftCustomer, draftCustomerId, setDraftCustomerId, product, productKey, setProduct, limits, dimsValid,
    notes, setNotes, promisedDate, setPromisedDate, counted, setCounted, policy, setPolicy,
    notifications, notificationRows, markAllRead, markRead, flags, flagRows, toggleFlag, support, setSupport, supportUntil, setSupportUntil,
    tick, audit, loggedIn, authStage, setAuthStage, signed, setSigned, offline, busy, sidebarScroll,
    ar, t, nav, money, total, title, notify, fail, record, go, refresh, newOrder, openOrderDesign, saveOrder, request,
    addCustomer, addTenant, recordPayment, decide, confirmInvoice, signOut,
  };
}
