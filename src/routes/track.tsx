import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PublicShell, usePublicLang } from "@/fos/public/PublicShell";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "تتبع طلبك | صنعة SANAA" },
      { name: "description", content: "تابع مرحلة تصنيع طلبك، موعد التسليم، والمدفوعات برقم العميل ورقم الطلب." },
      { property: "og:title", content: "تتبع طلبك | صنعة SANAA" },
      { property: "og:description", content: "تابع تصنيع طلبك وموعد التسليم والمدفوعات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrackPage,
});

function TrackPage() {
  const { lang, setLang, t } = usePublicLang();
  const [customerId, setCustomerId] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function call(path: string, init: RequestInit = {}, bearer = token) {
    const res = await fetch(`/api/customer/${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? "error");
    return data;
  }
  async function open(no: string, bearer = token) {
    setOrder(await call(`orders/${encodeURIComponent(no)}?language=${lang}`, {}, bearer));
  }
  useEffect(() => {
    if (token && order) open(order.order_no).catch(() => undefined);
  }, [lang]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await call("auth/login", { method: "POST", body: JSON.stringify({ customer_id: Number(customerId), order_no: orderNo.trim() }) }, null);
      setToken(data.access_token);
      const list = await call(`orders?language=${lang}`, {}, data.access_token);
      setOrders(list.orders);
      await open(orderNo.trim(), data.access_token);
    } catch (err) {
      const m = (err as Error).message;
      setError(/match/i.test(m) ? t("رقم العميل ورقم الطلب غير متطابقين", "Customer number and order number do not match") : m);
    } finally {
      setLoading(false);
    }
  }

  const money = (n: number) => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-EG", { maximumFractionDigits: 0 }).format(n);
  return (
    <PublicShell lang={lang} setLang={setLang}>
      <section className="panel public-card">
        <h1 style={{ fontSize: 22 }}>{t("تتبع طلبك", "Track your order")}</h1>
        {!token ? (
          <form onSubmit={login}>
            <p>{t("أدخل رقم العميل ورقم الطلب المكتوبين في فاتورتك.", "Enter the customer number and order number from your invoice.")}</p>
            <div className="field">
              <span>{t("رقم العميل", "Customer number")}</span>
              <input className="input" required inputMode="numeric" pattern="[0-9]+" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
            </div>
            <div className="field">
              <span>{t("رقم الطلب", "Order number")}</span>
              <input className="input" required maxLength={40} value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="SO-0613" dir="ltr" />
            </div>
            {error && <div className="notice danger">{error}</div>}
            <button className="button primary" type="submit" disabled={loading}>
              {loading ? "…" : t("عرض حالة الطلب", "Show order status")}
            </button>
          </form>
        ) : (
          order && (
            <>
              <div className="panel-heading" style={{ padding: "12px 0" }}>
                <div>
                  <h2>{order.order_no}</h2>
                  <p>{order.status_label}</p>
                </div>
                {orders.length > 1 && (
                  <select className="input" value={order.order_no} onChange={(e) => open(e.target.value)}>
                    {orders.map((o) => (
                      <option key={o.order_no} value={o.order_no}>
                        {o.order_no} · {o.status_label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="notice">{order.message}</div>
              <div className="track-grid">
                <div className="panel">
                  <small>{t("التصنيع", "Production")}</small>
                  <strong>{order.production.progress_pct ?? 0}%</strong>
                  <div className="payment-progress">
                    <span style={{ width: `${order.production.progress_pct ?? 0}%` }} />
                  </div>
                  <small>{order.production.current_stage ?? ""}</small>
                </div>
                <div className="panel">
                  <small>{t("الدفع", "Payment")}</small>
                  <strong>{order.payment.label}</strong>
                  <small>
                    {money(order.payment.paid_amount)} / {money(order.payment.total_amount)} EGP
                  </small>
                </div>
                <div className="panel">
                  <small>{t("التسليم", "Delivery")}</small>
                  <strong>{order.delivery.delivered_at ? String(order.delivery.delivered_at).slice(0, 10) : (order.delivery.expected_date ?? "—")}</strong>
                  <small>{order.delivery.is_late ? t("متأخر", "Late") : ""}</small>
                </div>
              </div>
              <button className="button" style={{ marginTop: 16 }} onClick={() => { setToken(null); setOrder(null); }}>
                {t("خروج", "Sign out")}
              </button>
            </>
          )
        )}
      </section>
    </PublicShell>
  );
}
