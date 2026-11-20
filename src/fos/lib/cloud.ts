/** Browser data access for the SANAA screens. Database rules decide what each signed-in person can see. */
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/fos/types";

export const sb = supabase as any;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Call the app's own REST API with the signed-in user's token. */
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  const type = response.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? response.json() : response.blob()) as Promise<T>;
}

const DATE = (iso: string | null, ar: boolean) =>
  iso ? new Date(iso).toLocaleDateString(ar ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

export async function fetchOrders(ar: boolean): Promise<Order[]> {
  const rows = check(await sb.from("orders")
    .select("id, order_no, status, product_summary, design, created_at, confirmed_at, subtotal, discount_amount, vat_pct, vat_amount, total_amount, invoice_confirmed_at, customer_tax_id, customer_id, customer:customers(id,name,phone), lines:order_lines(description, quantity, product:products(name_ar,name_en)), payments(amount)")
    .order("created_at", { ascending: false }).limit(300)) as any[];
  return rows.map((r) => {
    const line = r.lines?.[0];
    const product = r.product_summary || (line ? (ar ? line.product?.name_ar : line.product?.name_en) ?? line.description : "") || "—";
    return {
      id: r.order_no, dbId: r.id, customer: r.customer?.name ?? "—", customerId: r.customer_id, phone: r.customer?.phone ?? "",
      product, date: DATE(r.created_at, ar), total: Number(r.subtotal) - Number(r.discount_amount), status: r.status,
      paid: (r.payments ?? []).reduce((n: number, p: any) => n + Number(p.amount), 0),
      grandTotal: Number(r.total_amount), vatPct: Number(r.vat_pct), invoiceLocked: Boolean(r.invoice_confirmed_at),
      taxId: r.customer_tax_id ?? "", design: r.design ?? null,
    };
  });
}

export type Customer = { id: number; name: string; phone: string | null; city: string | null };
export async function fetchCustomers(): Promise<Customer[]> {
  return check(await sb.from("customers").select("id, name, phone, city").order("created_at", { ascending: false }).limit(500));
}
export async function addCustomer(name: string, phone: string, userId: string): Promise<Customer> {
  return check(await sb.from("customers").insert({ name, phone, created_by: userId }).select("id, name, phone, city").single());
}

export type Approval = { id: string; dbId: number; title: string; reason: string; status: string; requester: string; created: string; orderId: number | null };
export async function fetchApprovals(ar: boolean): Promise<Approval[]> {
  const rows = check(await sb.from("approvals").select("*").order("created_at", { ascending: false }).limit(100)) as any[];
  return rows.map((a) => ({ id: a.code, dbId: a.id, title: a.title, reason: a.decision_note ? `${a.reason} · ${a.decision_note}` : a.reason,
    status: a.status, requester: a.requester_name ?? "", created: DATE(a.created_at, ar), orderId: a.order_id }));
}
export async function requestApproval(title: string, reason: string, orderId: number | null, userId: string, name: string) {
  const code = `APR-${Date.now().toString().slice(-6)}`;
  check(await sb.from("approvals").insert({ code, title, reason, order_id: orderId, requested_by: userId, requester_name: name }));
}
export async function decideApproval(dbId: number, approved: boolean, note: string, userId: string) {
  check(await sb.from("approvals").update({ status: approved ? "approved" : "rejected", decision_note: note, decided_by: userId,
    decided_at: new Date().toISOString() }).eq("id", dbId));
}

export async function fetchSettings() {
  return check(await sb.from("factory_settings").select("*").eq("id", 1).maybeSingle()) as any;
}
export async function saveSettings(fields: Record<string, unknown>) {
  check(await sb.from("factory_settings").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", 1));
}

export async function fetchTenants() {
  return check(await sb.from("tenants").select("*").order("id")) as any[];
}
export async function addTenant(name: string, email: string, plan: string) {
  check(await sb.from("tenants").insert({ name, manager_email: email, plan }));
}
export async function fetchFlags() {
  return check(await sb.from("feature_flags").select("*").order("sort")) as any[];
}
export async function setFlag(key: string, enabled: boolean) {
  check(await sb.from("feature_flags").update({ enabled }).eq("key", key));
}
export async function fetchNotifications() {
  return check(await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(30)) as any[];
}
export async function markNotifications(ids: number[]) {
  if (ids.length) check(await sb.from("notifications").update({ read: true }).in("id", ids));
}
export async function fetchAudit(): Promise<string[]> {
  const rows = check(await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100)) as any[];
  return rows.map((r) => `${new Date(r.created_at).toLocaleString()} · ${r.actor_name ?? ""} · ${r.action}`);
}
export async function writeAudit(action: string, userId: string, name: string) {
  await sb.from("audit_log").insert({ actor: userId, actor_name: name, action });
}

export async function recordPayment(orderId: number, amount: number, method: string, userId: string) {
  check(await sb.from("payments").insert({ order_id: orderId, amount, method, recorded_by: userId }));
}
export async function confirmInvoice(orderId: number, taxId: string) {
  check(await sb.from("orders").update({ invoice_confirmed_at: new Date().toISOString(), customer_tax_id: taxId || null }).eq("id", orderId));
}

export async function fetchOpenShift(userId: string) {
  const rows = check(await sb.from("shifts").select("*").eq("employee", userId).order("opened_at", { ascending: false }).limit(1)) as any[];
  return rows[0] ?? null;
}
export async function openShift(userId: string) {
  return check(await sb.from("shifts").insert({ employee: userId }).select("*").single());
}
export async function closeShift(id: number, counted: number) {
  check(await sb.from("shifts").update({ counted_cash: counted, closed_at: new Date().toISOString() }).eq("id", id));
}
/** Cash payments this person recorded since the shift opened. */
export async function cashSince(userId: string, since: string): Promise<number> {
  const rows = check(await sb.from("payments").select("amount").eq("recorded_by", userId).eq("method", "cash").gte("paid_at", since)) as any[];
  return rows.reduce((n, r) => n + Number(r.amount), 0);
}

export type SaveOrderInput = {
  dbId?: number; customerId: number; productKey: string; productLabel: string; width: number; height: number; depth: number;
  doors: number; woodKey: string; finishKey: string; colorKey: string; unitPrice: number; vatPct: number; confirm: boolean;
  userId: string; notes?: string; promisedDate?: string | null; productId?: number | null; costRatio?: number;
};
export async function saveOrder(o: SaveOrderInput): Promise<{ id: number; order_no: string }> {
  const subtotal = o.unitPrice;
  const vat = Math.round(subtotal * o.vatPct) / 100;
  const fields: Record<string, unknown> = {
    customer_id: o.customerId, status: o.confirm ? "confirmed" : "draft",
    product_summary: `${o.productLabel} · ${o.width} × ${o.height} × ${o.depth}`,
    design: { product_type: o.productKey, width_cm: o.width, height_cm: o.height, depth_cm: o.depth, doors: o.doors, wood: o.woodKey,
      finish: o.finishKey, color: o.colorKey, notes: o.notes ?? "" },
    subtotal, vat_pct: o.vatPct, vat_amount: vat, total_amount: subtotal + vat, promised_date: o.promisedDate || null,
    confirmed_at: o.confirm ? new Date().toISOString() : null, channel: "showroom",
  };
  if (o.dbId) {
    return check(await sb.from("orders").update(fields).eq("id", o.dbId).select("id, order_no").single());
  }
  const orderNo = `ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const created = check(await sb.from("orders").insert({ ...fields, order_no: orderNo, created_by: o.userId }).select("id, order_no").single()) as any;
  if (o.productId) {
    await sb.from("order_lines").insert({ order_id: created.id, product_id: o.productId, description: fields["product_summary"], quantity: 1,
      unit_price: subtotal, line_total: subtotal, unit_cost: Math.round(subtotal * (o.costRatio ?? 0.6)) });
  }
  return created;
}
export async function productFor(productKey: string): Promise<{ id: number; costRatio: number } | null> {
  const rows = check(await sb.from("products").select("id, list_price, unit_cost").eq("catalog_type", productKey).eq("active", true).limit(1)) as any[];
  const r = rows[0];
  return r ? { id: r.id, costRatio: Number(r.list_price) > 0 ? Number(r.unit_cost) / Number(r.list_price) : 0.6 } : null;
}

/** Rows for the generic list screens, built from the real tables. */
export async function fetchRecords(page: string, ar: boolean): Promise<string[][]> {
  const L = (row: any, base = "name") => (ar ? row[`${base}_ar`] : row[`${base}_en`]) ?? row[`${base}_en`] ?? "";
  switch (page) {
    case "engineering": {
      const rows = check(await sb.from("boms").select("*").order("id", { ascending: false })) as any[];
      return rows.map((r) => [r.code, r.product_name, r.description ?? "", r.status]);
    }
    case "inventory": {
      const rows = check(await sb.from("materials").select("*").order("id")) as any[];
      return rows.map((r) => {
        const low = Number(r.stock_qty) <= Number(r.reorder_level);
        return [r.sku, L(r), (ar ? r.warehouse_ar : r.warehouse_en) ?? "", `${Number(r.stock_qty)} ${r.unit}${low ? (ar ? " · مخزون منخفض" : " · low stock") : ""}`];
      });
    }
    case "manufacturing": {
      const rows = check(await sb.from("production_orders").select("po_no, status, completed_steps, total_steps, current_stage_en, product:products(name_ar,name_en)")
        .not("status", "in", "(completed,cancelled)").order("id", { ascending: false }).limit(200)) as any[];
      return rows.map((r) => [r.po_no, r.product ? L(r.product) : "", r.current_stage_en ?? r.status,
        `${Math.round((r.completed_steps / Math.max(1, r.total_steps)) * 100)}%`]);
    }
    case "quality": {
      const rows = check(await sb.from("quality_checks").select("code, check_name, status, order:orders(order_no, product_summary)").order("id", { ascending: false }).limit(200)) as any[];
      return rows.map((r) => [r.code, r.order?.product_summary ?? r.order?.order_no ?? "", r.check_name, r.status]);
    }
    case "users": {
      const [profiles, roles] = await Promise.all([
        sb.from("profiles").select("id, full_name, email").then(check), sb.from("user_roles").select("user_id, role").then(check)]);
      return (profiles as any[]).map((p) => [p.id.slice(0, 8).toUpperCase(), p.full_name ?? "", p.email ?? "",
        (roles as any[]).filter((r) => r.user_id === p.id).map((r) => r.role).join(", ")]);
    }
    case "billing": {
      const rows = check(await sb.from("plans").select("*").order("code")) as any[];
      return rows.map((r) => [r.code, r.name, r.limits, r.price]);
    }
    case "health": {
      const probe = async (path: string) => {
        const started = performance.now();
        try { const r = await fetch(`/api/${path}`); return [r.ok, Math.round(performance.now() - started)] as const; } catch { return [false, 0] as const; }
      };
      const [web, db, ai] = await Promise.all([probe("health"), probe("health/database"), probe("health/ai")]);
      const s = (ok: boolean) => (ok ? "Healthy" : "Down");
      return [["API", "Core API", `${web[1]} ms`, s(web[0])], ["DB", "Database", `${db[1]} ms`, s(db[0])], ["AI", "AI service", `${ai[1]} ms`, s(ai[0])]];
    }
    case "security": {
      const rows = check(await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(50)) as any[];
      return rows.map((r) => [`EVT-${r.id}`, r.actor_name ?? "", r.action, new Date(r.created_at).toLocaleString()]);
    }
    case "announcements": {
      const rows = check(await sb.from("announcements").select("*").order("created_at", { ascending: false })) as any[];
      return rows.map((r) => [r.code, r.title, r.audience, r.status]);
    }
    default:
      return [];
  }
}
