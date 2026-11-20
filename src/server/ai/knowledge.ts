/** Keyword RAG over the knowledge base (port of app/ai/rag.py). */
import businessRules from "./knowledge/business_rules.md?raw";
import customerSupplier from "./knowledge/customer_supplier_schema.md?raw";
import databaseSchema from "./knowledge/database_schema.md?raw";
import financeSchema from "./knowledge/finance_schema.md?raw";
import furnitureKnowledge from "./knowledge/furniture_knowledge.md?raw";
import inventorySchema from "./knowledge/inventory_schema.md?raw";
import productionSchema from "./knowledge/production_schema.md?raw";
import salesSchema from "./knowledge/sales_schema.md?raw";
import { normalize } from "@/shared/language";

const FILES: Record<string, string> = {
  "business_rules.md": businessRules,
  "customer_supplier_schema.md": customerSupplier,
  "database_schema.md": databaseSchema,
  "finance_schema.md": financeSchema,
  "furniture_knowledge.md": furnitureKnowledge,
  "inventory_schema.md": inventorySchema,
  "production_schema.md": productionSchema,
  "sales_schema.md": salesSchema,
};

type Domain = { name: string; file: string; views: string[]; keywords: string[]; rules: string[] };
export const DOMAINS: Domain[] = [
  { name: "finance", file: "finance_schema.md", views: ["v_company_monthly_pnl", "v_branch_monthly_pnl"],
    keywords: ["profit", "loss", "p&l", "pnl", "margin", "expense", "cost", "net", "income", "finance",
      "ربح", "ارباح", "أرباح", "خساره", "خسارة", "خسائر", "مصروف", "مصاريف", "تكلفه", "تكلفة", "هامش", "صافي", "ماليه", "مالية", "ميزانيه"],
    rules: ["Revenue", "Cost of Goods Sold", "Branch Profit and Loss", "Company Profit and Loss"] },
  { name: "sales", file: "sales_schema.md", views: ["v_sales_lines", "v_monthly_sales", "v_product_performance", "v_orders"],
    keywords: ["sale", "sales", "sold", "revenue", "product", "category", "wood", "finish", "order", "quotation", "discount",
      "channel", "rep", "best", "top", "selling", "compare",
      "مبيعات", "مبيع", "بيع", "منتج", "منتجات", "ايراد", "إيراد", "ايرادات", "طلب", "طلبات", "عرض سعر", "خصم", "خشب", "تشطيب",
      "فئه", "فئة", "قارن", "مقارنه", "مقارنة", "اكتر", "أكتر", "أكثر"],
    rules: ["Sales", "Revenue", "Cost of Goods Sold", "Orders and Quotations"] },
  { name: "branches", file: "finance_schema.md", views: ["v_branch_monthly_pnl", "v_monthly_sales"],
    keywords: ["branch", "showroom", "factory", "فرع", "فروع", "معرض", "مصنع"], rules: ["Branch Profit and Loss"] },
  { name: "inventory", file: "inventory_schema.md", views: ["v_inventory_status"],
    keywords: ["stock", "inventory", "material", "reorder", "warehouse", "مخزون", "خامات", "خامه", "خامة", "مخزن", "نواقص"],
    rules: ["Inventory"] },
  { name: "production", file: "production_schema.md", views: ["v_production_status"],
    keywords: ["production", "manufactur", "late", "delay", "stage", "factory", "انتاج", "إنتاج", "تصنيع", "متاخر", "متأخر", "مرحله", "مرحلة"],
    rules: ["Production"] },
  { name: "customers", file: "customer_supplier_schema.md", views: ["v_customer_summary"],
    keywords: ["customer", "client", "lifetime", "عميل", "عملاء", "زبون", "زباين"], rules: ["Customers"] },
  { name: "suppliers", file: "customer_supplier_schema.md", views: ["v_supplier_monthly"],
    keywords: ["supplier", "vendor", "purchase", "مورد", "موردين", "مشتريات"], rules: ["Suppliers"] },
];
const DEFAULT_DOMAINS = ["finance", "sales"];
const ALWAYS_RULES = ["Data Completeness"];

type Section = { source: string; title: string; body: string };
const sectionText = (s: Section) => `[${s.source} / ${s.title}]\n${s.body.trim()}`;

let cache: Section[] | null = null;
export function loadSections(): Section[] {
  if (cache) return cache;
  const sections: Section[] = [];
  for (const name of Object.keys(FILES).sort()) {
    const content = FILES[name]!;
    const matches = [...content.matchAll(/^(#{1,3})\s+(.+)$/gm)];
    matches.forEach((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = index + 1 < matches.length ? (matches[index + 1]!.index ?? content.length) : content.length;
      const body = content.slice(start, end).trim();
      if (body) sections.push({ source: name, title: match[2]!.trim(), body });
    });
  }
  cache = sections;
  return sections;
}

export function detectDomains(question: string): string[] {
  const clean = normalize(question);
  const scores = new Map<string, number>();
  for (const domain of DOMAINS) {
    const score = domain.keywords.filter((w) => clean.includes(normalize(w))).length;
    if (score) scores.set(domain.name, score);
  }
  if (!scores.size) return [...DEFAULT_DOMAINS];
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

const titleMatches = (title: string, wanted: string) =>
  title.replace(/^\d+\.\s*/, "").trim().toLowerCase() === wanted.toLowerCase();

export function retrieve(question: string, maxSections = 14) {
  const names = detectDomains(question);
  const domains = DOMAINS.filter((d) => names.includes(d.name));
  const sections = loadSections();
  const views = ["v_as_of"];
  const ruleTitles: string[] = [];
  const files: string[] = [];
  for (const domain of domains) {
    for (const v of domain.views) if (!views.includes(v)) views.push(v);
    for (const r of domain.rules) if (!ruleTitles.includes(r)) ruleTitles.push(r);
    if (!files.includes(domain.file)) files.push(domain.file);
  }
  for (const r of ALWAYS_RULES) if (!ruleTitles.includes(r)) ruleTitles.push(r);
  const chosen: Section[] = [];
  for (const view of views) chosen.push(...sections.filter((s) => s.source === "database_schema.md" && s.title.endsWith(view)));
  chosen.push(...sections.filter((s) => s.source === "database_schema.md" && s.title === "SQL Rules"));
  for (const title of ruleTitles) chosen.push(...sections.filter((s) => s.source === "business_rules.md" && titleMatches(s.title, title)));
  for (const file of files) chosen.push(...sections.filter((s) => s.source === file));
  const unique = chosen.filter((s, i) => chosen.indexOf(s) === i).slice(0, maxSections);
  return { domain: names[0]!, domains: names, views, rules: ruleTitles, context: unique.map(sectionText).join("\n\n") };
}
