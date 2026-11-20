/** Phase 5: customer order tracking — always filtered by order_no AND customer_id (port of order_tracking.py). */
import { createCustomerToken } from "@/server/core/auth";
import { NotFoundError, UnauthorizedError } from "@/server/core/http";
import { adminDb } from "@/server/core/supabase";
import { getReferenceDate } from "@/server/analysis/db";
import type { Language } from "@/shared/language";

const STAGES_AR: Record<string, string> = {
  cutting: "القص", "edge banding": "تركيب الشريط (الحواف)", assembly: "التجميع", sanding: "الصنفرة",
  finishing: "الدهان والتشطيب", upholstery: "التنجيد", "quality control": "مراجعة الجودة", packaging: "التغليف",
};
const DELIVERY_STATUSES = new Set(["shipped", "out_for_delivery", "in_transit", "dispatched"]);
const PAYMENT_LABELS: Record<string, [string, string]> = {
  paid: ["مدفوع بالكامل", "Fully paid"], partially_paid: ["مدفوع جزئياً", "Partially paid"],
  unpaid: ["لم يتم الدفع", "Not paid yet"], cancelled: ["ملغي", "Cancelled"],
};

type Row = Record<string, any>;

export function paymentStatus(total: number, paid: number, balance: number, status: string): string {
  if (status === "cancelled") return "cancelled";
  if (total <= 0 || balance <= 0) return "paid";
  return paid > 0 ? "partially_paid" : "unpaid";
}
const percent = (done: unknown, total: unknown) => {
  const d = Number(done), t = Number(total);
  return t && Number.isFinite(d) ? Math.round((d / t) * 1000) / 10 : null;
};
const money = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const stageLabel = (stage: unknown, language: Language) =>
  language === "ar" ? (STAGES_AR[String(stage ?? "").toLowerCase()] ?? (stage as string | null) ?? null) : ((stage as string | null) ?? null);

async function rpc<T>(name: "track_order" | "customer_orders" | "order_production", args: Record<string, unknown>): Promise<T> {
  const db = await adminDb();
  const { data, error } = await db.rpc(name as never, args as never);
  if (error) throw new Error(`Database error: ${error.message}`);
  return data as T;
}

export async function login(customerId: number, orderNo: string) {
  const rows = await rpc<Row[]>("track_order", { p_customer_id: customerId, p_order_no: orderNo.trim() });
  if (!rows?.length) throw new UnauthorizedError("Customer number and order number do not match");
  const { token, expiresIn } = await createCustomerToken(customerId);
  return { access_token: token, token_type: "bearer", expires_in: expiresIn, customer_id: customerId };
}

export async function myOrders(customerId: number, language: Language = "ar") {
  const rows = await rpc<Row[]>("customer_orders", { p_customer_id: customerId });
  const label = language === "ar" ? "status_label_ar" : "status_label_en";
  return (rows ?? []).map((row) => ({ ...row, status_label: row[label] || row["status"] }));
}

export async function track(customerId: number, orderNo: string, language: Language = "ar") {
  const rows = await rpc<Row[]>("track_order", { p_customer_id: customerId, p_order_no: orderNo.trim() });
  if (!rows?.length) throw new NotFoundError("Order not found"); // same answer whether it doesn't exist or isn't yours
  const order = rows[0]!;
  const production = (await rpc<Row[]>("order_production", { p_order_no: order["order_no"] })) ?? [];
  return buildTracking(order, production, language, await getReferenceDate());
}

export function buildTracking(order: Row, production: Row[], language: Language, reference: string) {
  const status = String(order["status"]).toLowerCase();
  const total = Number(order["total_amount"] ?? 0), paid = Number(order["paid_amount"] ?? 0), balance = Number(order["balance_due"] ?? 0);
  const pay = paymentStatus(total, paid, balance, status);
  const active = production.filter((p) => String(p["status"] ?? "").toLowerCase() !== "cancelled");
  const current = active.find((p) => !["completed", "done"].includes(String(p["status"] ?? "").toLowerCase()));
  const promised = order["promised_date"] as string | null;
  const delivered = order["delivered_at"] as string | null;
  const late = Boolean(promised && !delivered && String(promised).slice(0, 10) < reference);
  const shipment = delivered ? "delivered" : DELIVERY_STATUSES.has(status) ? "on_the_way"
    : ["ready", "ready_for_delivery", "packed"].includes(status) ? "ready_for_dispatch" : status === "cancelled" ? "cancelled" : "not_shipped";
  const result: Row = {
    order_no: order["order_no"], status,
    status_label: order[language === "ar" ? "status_label_ar" : "status_label_en"] || status,
    status_seq: order["status_seq"], created_at: order["created_at"], confirmed_at: order["confirmed_at"],
    production: {
      progress_pct: percent(order["completed_steps"], order["total_steps"]),
      completed_steps: order["completed_steps"], total_steps: order["total_steps"],
      current_stage: stageLabel(current?.["current_stage_en"], language),
      items: active.map((p) => ({
        po_no: p["po_no"], product: p[language === "ar" ? "product_name_ar" : "product_name_en"], status: p["status"],
        quantity: p["quantity"], progress_pct: percent(p["completed_steps"], p["total_steps"]),
        current_stage: stageLabel(p["current_stage_en"], language), is_late: Boolean(p["is_late"]),
      })),
    },
    payment: { status: pay, label: PAYMENT_LABELS[pay]![language === "ar" ? 0 : 1], total_amount: total, paid_amount: paid,
      balance_due: balance, currency: "EGP" },
    delivery: { expected_date: promised, delivered_at: delivered, shipment_status: shipment, is_late: late },
    last_update_at: order["last_update_at"],
  };
  result["message"] = trackingMessage(result, language);
  return result;
}

export function trackingMessage(r: Row, language: Language): string {
  const p = r["production"], pay = r["payment"], dlv = r["delivery"];
  const g = (v: number) => String(Number(v));
  if (language === "ar") {
    const parts = [`طلبك رقم ${r["order_no"]} حالته: ${r["status_label"]}.`];
    if (dlv.delivered_at) parts.push(`تم التسليم بتاريخ ${String(dlv.delivered_at).slice(0, 10)}.`);
    else {
      if (p.progress_pct !== null && r["status"] !== "cancelled") {
        parts.push(`نسبة التصنيع ${g(p.progress_pct)}%${p.current_stage ? ` — المرحلة الحالية: ${p.current_stage}` : ""}.`);
      }
      if (dlv.shipment_status === "on_the_way") parts.push("الطلب في الطريق إليك.");
      if (dlv.expected_date && r["status"] !== "cancelled") {
        parts.push(`موعد التسليم المتوقع: ${String(dlv.expected_date).slice(0, 10)}${dlv.is_late ? " (متأخر، فريقنا هيتواصل معاك)." : "."}`);
      }
    }
    if (r["status"] !== "cancelled") {
      parts.push(`الدفع: ${pay.label} — المدفوع ${money(pay.paid_amount)} من ${money(pay.total_amount)} جنيه${pay.balance_due > 0 ? `، المتبقي ${money(pay.balance_due)} جنيه.` : "."}`);
    }
    return parts.join(" ");
  }
  const parts = [`Your order ${r["order_no"]} is: ${r["status_label"]}.`];
  if (dlv.delivered_at) parts.push(`Delivered on ${String(dlv.delivered_at).slice(0, 10)}.`);
  else {
    if (p.progress_pct !== null && r["status"] !== "cancelled") {
      parts.push(`Production is ${g(p.progress_pct)}% complete${p.current_stage ? ` - current stage: ${p.current_stage}` : ""}.`);
    }
    if (dlv.shipment_status === "on_the_way") parts.push("Your order is on the way.");
    if (dlv.expected_date && r["status"] !== "cancelled") {
      parts.push(`Expected delivery: ${String(dlv.expected_date).slice(0, 10)}${dlv.is_late ? " (late - our team will contact you)." : "."}`);
    }
  }
  if (r["status"] !== "cancelled") {
    parts.push(`Payment: ${pay.label} - paid EGP ${money(pay.paid_amount)} of ${money(pay.total_amount)}${pay.balance_due > 0 ? `, balance EGP ${money(pay.balance_due)}.` : "."}`);
  }
  return parts.join(" ");
}

/** Sliding-window login limiter stored in the database (workers are stateless). */
export async function checkLoginRate(ip: string, maxCalls = 10, windowSeconds = 300): Promise<boolean> {
  const db = await adminDb();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count } = await db.from("login_attempts").select("id", { count: "exact", head: true }).eq("ip", ip).gte("attempted_at", since);
  if ((count ?? 0) >= maxCalls) return false;
  await db.from("login_attempts").insert({ ip });
  return true;
}
