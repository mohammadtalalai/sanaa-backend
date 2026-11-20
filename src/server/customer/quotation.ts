/** Quotation creation and formatting (port of quotation.py). */
import { CostCalculator, addDays, isoDate, type ItemSpec } from "@/shared/costing";
import { getCatalog } from "@/shared/catalog";
import type { Language } from "@/shared/language";
import { nowIso, tokenHex, ymd } from "./ids";
import { saveQuotation, type Quotation } from "./repository";

export const QUOTATION_VALID_DAYS = 14;
export const newQuotationNo = () => `Q-AI-${ymd()}-${tokenHex(3).toUpperCase()}`;

export function itemFromData(data: Record<string, string | number>): ItemSpec {
  return {
    product_type: String(data["product_type"]), width_cm: Number(data["width_cm"]), depth_cm: Number(data["depth_cm"]),
    height_cm: Number(data["height_cm"]), wood: String(data["wood"]), finish: String(data["finish"]), color: String(data["color"]),
    quantity: Math.trunc(Number(data["quantity"])), city: data["city"] ? String(data["city"]) : null,
  };
}

const money = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const g = (v: number) => String(Number(v));

export function formatQuotation(q: Quotation, language: Language): string {
  const catalog = getCatalog();
  const item = q["item"] as ItemSpec, p = q["pricing"];
  const label = (field: "product_type" | "wood" | "finish" | "color" | "city") => catalog.label(field, String(item[field]), language);
  const dims = `${g(item.width_cm)}×${g(item.depth_cm)}×${g(item.height_cm)}`;
  if (language === "ar") {
    return [
      `عرض السعر رقم ${q.quotation_no}`,
      `- المنتج: ${label("product_type")} (${dims} سم) × ${item.quantity}`,
      `- الخشب: ${label("wood")} | التشطيب: ${label("finish")} | اللون: ${label("color")}`,
      `- سعر القطعة: ${money(p.unit_price)} جنيه`,
      `- الإجمالي قبل الضريبة: ${money(p.subtotal)} جنيه`,
      `- التوصيل (${label("city")}): ${money(p.delivery_cost)} جنيه`,
      `- ضريبة القيمة المضافة ${g(p.vat_pct)}%: ${money(p.vat_amount)} جنيه`,
      `- الإجمالي: ${money(p.total)} جنيه`,
      `- التسليم المتوقع: ${p.estimated_delivery_date} (تصنيع ${p.production_days} يوم + توصيل ${p.delivery_days} يوم)`,
      `- العرض ساري حتى ${q["valid_until"]}`,
    ].join("\n");
  }
  return [
    `Quotation ${q.quotation_no}`,
    `- Product: ${label("product_type")} (${dims} cm) x ${item.quantity}`,
    `- Wood: ${label("wood")} | Finish: ${label("finish")} | Colour: ${label("color")}`,
    `- Unit price: EGP ${money(p.unit_price)}`,
    `- Subtotal: EGP ${money(p.subtotal)}`,
    `- Delivery (${label("city")}): EGP ${money(p.delivery_cost)}`,
    `- VAT ${g(p.vat_pct)}%: EGP ${money(p.vat_amount)}`,
    `- Total: EGP ${money(p.total)}`,
    `- Expected delivery: ${p.estimated_delivery_date} (production ${p.production_days} days + delivery ${p.delivery_days} days)`,
    `- Valid until ${q["valid_until"]}`,
  ].join("\n");
}

export async function createQuotation(data: Record<string, string | number>, sessionId: string, language: Language): Promise<Quotation> {
  const today = new Date();
  const item = itemFromData(data);
  const pricing = new CostCalculator().quote(item, today);
  const quotation: Quotation = {
    quotation_no: newQuotationNo(), session_id: sessionId,
    customer_name: data["customer_name"] ?? null, customer_phone: data["customer_phone"] ?? null,
    language, item, pricing, currency: pricing.currency, total: pricing.total,
    valid_until: isoDate(addDays(today, QUOTATION_VALID_DAYS)), status: "draft", design_id: null,
    created_at: nowIso(), accepted_at: null,
  };
  await saveQuotation(quotation);
  return quotation;
}
