/** Rule-based findings + recommendations from history and forecasts (port of recommender.py / monthly_report.py). */
import { chatJson, LLMError, strictObject } from "@/server/ai/gateway";
import { buildRecommendationPrompt, recommendationSystemPrompt } from "@/server/ai/prompts";
import { fetchAll, getReferenceDate, type Row } from "@/server/analysis/db";
import { adminDb } from "@/server/core/supabase";
import { addMonths, forecast, lastCompleteMonth, monthlySeries, pctChange, recentVsPrevious, type ForecastResult } from "./series";

const QUERIES: Record<string, string> = {
  monthly_sales: `SELECT sale_month, SUM(orders) AS orders, SUM(units) AS units, SUM(net_revenue) AS net_revenue,
      SUM(gross_profit) AS gross_profit FROM analytics.v_monthly_sales GROUP BY sale_month ORDER BY sale_month`,
  branch_pnl: `SELECT month_start, branch_id, branch_name_en, branch_name_ar, branch_type, revenue, cogs, delivery_cost,
      operating_expenses, net_profit FROM analytics.v_branch_monthly_pnl ORDER BY month_start, branch_id`,
  company_pnl: `SELECT month_start, revenue, gross_profit, operating_expenses, net_profit, net_margin_pct
      FROM analytics.v_company_monthly_pnl ORDER BY month_start`,
  product_monthly: `SELECT sale_month, sku, product_name_en, product_name_ar, category_name_en, category_name_ar,
      SUM(quantity) AS units, SUM(net_revenue) AS net_revenue, SUM(gross_profit) AS gross_profit FROM analytics.v_sales_lines
      GROUP BY sale_month, sku, product_name_en, product_name_ar, category_name_en, category_name_ar ORDER BY sale_month, sku`,
  inventory: `SELECT sku, name_en, name_ar, material_type, unit, stock_qty, reorder_level, stock_value, stock_status,
      supplier_name_en, supplier_name_ar, lead_time_days FROM analytics.v_inventory_status`,
  production: `SELECT po_no, sku, product_name_en, product_name_ar, status, quantity, planned_end, is_late, material_cost,
      labor_cost, standard_cost, current_stage_en FROM analytics.v_production_status`,
};

const TEXT = {
  ar: {
    sales_title: "اتجاه المبيعات",
    sales_detail: "صافي إيرادات {month}: {value} جنيه ({mom} مقارنة بالشهر السابق، {yoy} مقارنة بنفس الشهر من العام الماضي).",
    grow_action: "زيادة إنتاج ومخزون {name}",
    grow_reason: "مبيعات آخر 3 شهور زادت {growth}% عن الثلاثة السابقة ({recent} وحدة)، والمتوقع الشهر القادم {forecast} وحدة.",
    decline_action: "تقليل إنتاج {name} ومراجعة تسعيره وعرضه",
    decline_reason: "مبيعات آخر 3 شهور انخفضت {growth}% عن الثلاثة السابقة.",
    branch_action: "مراجعة مصروفات وأداء فرع {name}",
    branch_reason: "صافي الربح سالب في {months} من آخر 3 شهور (الإجمالي {total} جنيه).",
    branches_title: "أداء الفروع",
    branch_best: "أفضل فرع في آخر 3 شهور: {name} بصافي ربح {total} جنيه.",
    reorder_action: "إعادة طلب {name} ({qty} {unit})",
    reorder_reason: "المخزون {stock} {unit} أقل من أو يساوي حد الطلب {level}، ومدة التوريد {lead} يوم من {supplier}.",
    late_action: "متابعة أوامر الإنتاج المتأخرة",
    late_reason: "{late} من {total} أمر إنتاج مفتوح متأخر ({pct}%).",
    cost_action: "مراجعة تكلفة إنتاج {name}",
    cost_reason: "التكلفة الفعلية أعلى من المعيارية بنسبة {pct}%.",
    forecast_title: "توقع الإيرادات",
    forecast_detail: "الإيراد المتوقع للشهور القادمة: {values}.",
    na: "غير متاح",
  },
  en: {
    sales_title: "Sales trend",
    sales_detail: "Net revenue in {month}: EGP {value} ({mom} vs previous month, {yoy} vs same month last year).",
    grow_action: "Increase production and stock of {name}",
    grow_reason: "Last 3 months sales grew {growth}% vs the previous 3 ({recent} units); next month forecast {forecast} units.",
    decline_action: "Reduce production of {name} and review its price and display",
    decline_reason: "Last 3 months sales fell {growth}% vs the previous 3.",
    branch_action: "Review expenses and performance of {name}",
    branch_reason: "Net profit was negative in {months} of the last 3 months (total EGP {total}).",
    branches_title: "Branch performance",
    branch_best: "Best branch in the last 3 months: {name} with net profit EGP {total}.",
    reorder_action: "Reorder {name} ({qty} {unit})",
    reorder_reason: "Stock {stock} {unit} is at or below the reorder level {level}; lead time {lead} days from {supplier}.",
    late_action: "Follow up late production orders",
    late_reason: "{late} of {total} open production orders are late ({pct}%).",
    cost_action: "Review production cost of {name}",
    cost_reason: "Actual cost is {pct}% above the standard cost.",
    forecast_title: "Revenue forecast",
    forecast_detail: "Expected revenue for the next months: {values}.",
    na: "n/a",
  },
};

type Lang = "ar" | "en";
export type Finding = { area: string; title: string; detail: string; severity: string; metrics: Record<string, unknown> };
export type Recommendation = { area: string; action: string; reason: string; priority: number; evidence: Record<string, unknown> };
export type RecommendationReport = {
  language: Lang; reference_date: string; last_complete_month: string; findings: Finding[]; forecasts: ForecastResult[];
  recommendations: Recommendation[]; evaluation: Record<string, unknown>; summary: string; priorities: string[];
  generated_at: string; saved_to?: string[];
};

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
const money = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
const pct = (v: number | null, na: string) => (v === null ? na : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const num = (v: unknown) => Number(v ?? 0);

export async function loadHistory(): Promise<Record<string, Row[]>> {
  const entries = await Promise.all(Object.entries(QUERIES).map(async ([name, sql]) => [name, await fetchAll(sql)] as const));
  return Object.fromEntries(entries);
}

export function buildRecommendations(data: Record<string, Row[]>, referenceDate: string, language: Lang): RecommendationReport {
  const t = TEXT[language];
  const nameCol = language === "ar" ? "product_name_ar" : "product_name_en";
  const branchCol = language === "ar" ? "branch_name_ar" : "branch_name_en";
  const materialCol = language === "ar" ? "name_ar" : "name_en";
  const supplierCol = language === "ar" ? "supplier_name_ar" : "supplier_name_en";
  const until = lastCompleteMonth(referenceDate);
  const findings: Finding[] = [], recs: Recommendation[] = [], forecasts: ForecastResult[] = [];

  // 1. sales trend + revenue forecast
  const revenue = monthlySeries(data["monthly_sales"]!, "sale_month", "net_revenue", until);
  if (revenue.values.length) {
    const v = revenue.values;
    const current = v[v.length - 1]!;
    const previous = v.length > 1 ? v[v.length - 2]! : null;
    const lastYear = v.length > 12 ? v[v.length - 13]! : null;
    const mom = pctChange(current, previous), yoy = pctChange(current, lastYear);
    findings.push({ area: "sales", title: t.sales_title, severity: (mom ?? 0) < -10 ? "warning" : "info",
      detail: fill(t.sales_detail, { month: until.slice(0, 7), value: money(current), mom: pct(mom, t.na), yoy: pct(yoy, t.na) }),
      metrics: { month: until.slice(0, 7), net_revenue: current, mom_pct: mom, yoy_pct: yoy } });
    const revenueForecast = forecast(revenue, "company_net_revenue");
    forecasts.push(revenueForecast);
    findings.push({ area: "sales", title: t.forecast_title, severity: "info",
      detail: fill(t.forecast_detail, { values: revenueForecast.forecast.map((p) => `${p.month.slice(0, 7)}: ${money(p.value)}`).join(", ") }),
      metrics: { forecast: revenueForecast.forecast } });
  }

  // 2. products
  const products = data["product_monthly"]!;
  if (products.length) {
    const trend = recentVsPrevious(products, "sku", "units", until);
    const names = new Map<string, string>();
    for (const row of products) if (!names.has(String(row["sku"]))) names.set(String(row["sku"]), String(row[nameCol]));
    const top = [...trend].sort((a, b) => b.recent - a.recent).slice(0, 5);
    for (const row of top) {
      const units = monthlySeries(products.filter((p) => String(p["sku"]) === row.key), "sale_month", "units", until);
      const result = forecast(units, `units_${row.key}`);
      forecasts.push(result);
      if (row.growth_pct !== null && row.growth_pct >= 10) {
        recs.push({ area: "production", priority: 1, action: fill(t.grow_action, { name: names.get(row.key)! }),
          reason: fill(t.grow_reason, { growth: row.growth_pct.toFixed(1), recent: Math.trunc(row.recent),
            forecast: Math.round(result.forecast[0]!.value) }),
          evidence: { sku: row.key, recent_units: row.recent, previous_units: row.previous, growth_pct: row.growth_pct,
            forecast_next_month: result.forecast[0]!.value } });
      }
    }
    const decliners = trend.filter((r) => r.previous >= 5 && r.growth_pct !== null && r.growth_pct <= -25)
      .sort((a, b) => a.growth_pct! - b.growth_pct!).slice(0, 3);
    for (const row of decliners) {
      recs.push({ area: "production", priority: 2, action: fill(t.decline_action, { name: names.get(row.key)! }),
        reason: fill(t.decline_reason, { growth: Math.abs(row.growth_pct!).toFixed(1) }),
        evidence: { sku: row.key, recent_units: row.recent, previous_units: row.previous, growth_pct: row.growth_pct } });
    }
  }

  // 3. branches (sales branches only)
  const branches = data["branch_pnl"]!;
  if (branches.length) {
    const start = addMonths(until, -2);
    const summary = new Map<string, { total: number; loss: number }>();
    for (const row of branches) {
      const m = String(row["month_start"]).slice(0, 10);
      if (m < start || m > until || String(row["branch_type"]).toLowerCase() === "factory") continue;
      const name = String(row[branchCol]);
      const entry = summary.get(name) ?? { total: 0, loss: 0 };
      entry.total += num(row["net_profit"]);
      if (num(row["net_profit"]) < 0) entry.loss += 1;
      summary.set(name, entry);
    }
    if (summary.size) {
      const [best, bestRow] = [...summary.entries()].sort((a, b) => b[1].total - a[1].total)[0]!;
      findings.push({ area: "branches", title: t.branches_title, severity: "info",
        detail: fill(t.branch_best, { name: best, total: money(bestRow.total) }), metrics: { branch: best, net_profit_3m: bestRow.total } });
      for (const [name, row] of summary) {
        if (row.loss >= 2) {
          recs.push({ area: "branches", priority: 1, action: fill(t.branch_action, { name }),
            reason: fill(t.branch_reason, { months: row.loss, total: money(row.total) }),
            evidence: { branch: name, loss_months: row.loss, net_profit_3m: row.total } });
        }
      }
    }
  }

  // 4. inventory
  const low = data["inventory"]!.filter((r) => String(r["stock_status"]).toUpperCase() === "LOW")
    .sort((a, b) => num(b["lead_time_days"]) - num(a["lead_time_days"])).slice(0, 8);
  for (const row of low) {
    const quantity = Math.max(num(row["reorder_level"]) * 2 - num(row["stock_qty"]), 0);
    recs.push({ area: "inventory", priority: num(row["lead_time_days"]) >= 14 ? 1 : 2,
      action: fill(t.reorder_action, { name: String(row[materialCol]), qty: money(quantity), unit: String(row["unit"]) }),
      reason: fill(t.reorder_reason, { stock: money(num(row["stock_qty"])), unit: String(row["unit"]), level: money(num(row["reorder_level"])),
        lead: Math.trunc(num(row["lead_time_days"])), supplier: String(row[supplierCol] ?? "") }),
      evidence: { sku: row["sku"], stock_qty: row["stock_qty"], reorder_level: row["reorder_level"], suggested_qty: quantity } });
  }

  // 5. production
  const production = data["production"]!;
  if (production.length) {
    const open = production.filter((p) => !["completed", "cancelled"].includes(String(p["status"]).toLowerCase()));
    if (open.length) {
      const late = open.filter((p) => Boolean(p["is_late"])).length;
      const share = Math.round((late / open.length) * 1000) / 10;
      if (late) recs.push({ area: "production", priority: share >= 20 ? 1 : 2, action: t.late_action,
        reason: fill(t.late_reason, { late, total: open.length, pct: share }), evidence: { late, open: open.length, late_pct: share } });
    }
    const byProduct = new Map<string, { actual: number; standard: number }>();
    for (const p of production.filter((p) => String(p["status"]).toLowerCase() === "completed")) {
      const name = String(p[nameCol]);
      const e = byProduct.get(name) ?? { actual: 0, standard: 0 };
      e.actual += num(p["material_cost"]) + num(p["labor_cost"]);
      e.standard += num(p["standard_cost"]);
      byProduct.set(name, e);
    }
    [...byProduct.entries()].filter(([, e]) => e.standard > 0).map(([name, e]) => ({ name, overrun: (e.actual / e.standard - 1) * 100 }))
      .filter((e) => e.overrun > 10).sort((a, b) => b.overrun - a.overrun).slice(0, 3)
      .forEach((e) => recs.push({ area: "production", priority: 2, action: fill(t.cost_action, { name: e.name }),
        reason: fill(t.cost_reason, { pct: e.overrun.toFixed(1) }), evidence: { product: e.name, overrun_pct: Math.round(e.overrun * 100) / 100 } }));
  }

  recs.sort((a, b) => a.priority - b.priority);
  const report: RecommendationReport = { language, reference_date: referenceDate, last_complete_month: until.slice(0, 7), findings,
    forecasts, recommendations: recs, evaluation: {}, summary: "", priorities: [], generated_at: new Date().toISOString().slice(0, 19) };
  report.evaluation = evaluateReport(report, data, until);
  return report;
}

/** Compare the recommendations and the models with the history they came from. */
export function evaluateReport(report: RecommendationReport, data: Record<string, Row[]>, until: string) {
  const checks: { check: string; passed: boolean; detail?: unknown }[] = [];
  const trend = new Map(recentVsPrevious(data["product_monthly"] ?? [], "sku", "units", until).map((r) => [r.key, r]));
  for (const rec of report.recommendations) {
    const sku = rec.evidence["sku"] as string | undefined;
    if (rec.area === "production" && sku && trend.has(sku)) {
      const h = trend.get(sku)!;
      const growth = Number(rec.evidence["growth_pct"]);
      const consistent = (growth > 0 && h.recent > h.previous) || (growth < 0 && h.recent < h.previous);
      checks.push({ check: `trend matches history (${sku})`, passed: consistent, detail: { recent: h.recent, previous: h.previous } });
    }
    if (rec.area === "inventory") {
      checks.push({ check: `low stock confirmed (${sku})`, passed: num(rec.evidence["stock_qty"]) <= num(rec.evidence["reorder_level"]), detail: rec.evidence });
    }
  }
  const factoryFlagged = report.recommendations.some((r) => r.area === "branches" && /factory|مصنع/i.test(String(r.evidence["branch"] ?? "")));
  checks.push({ check: "factory not flagged as a losing sales branch", passed: !factoryFlagged });
  checks.push({ check: "partial reference month excluded", passed: report.last_complete_month < report.reference_date.slice(0, 7) });
  const tested = report.forecasts.filter((f) => f.beats_naive !== null);
  const wins = tested.filter((f) => f.beats_naive).length;
  return {
    checks, checks_passed: checks.every((c) => c.passed), models_tested: tested.length,
    model_win_rate_vs_naive: tested.length ? Math.round((wins / tested.length) * 1000) / 10 : null,
    backtest: tested.map((f) => ({ target: f.target, model_mae: f.backtest_mae, naive_mae: f.naive_mae })),
  };
}

export function toMarkdown(report: RecommendationReport): string {
  const f2 = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v));
  const lines = [`# Monthly report - ${report.last_complete_month}`, `_Data as of ${report.reference_date} - generated ${report.generated_at}_`, ""];
  if (report.summary) lines.push("## Summary", report.summary, "");
  if (report.priorities.length) lines.push("## Priorities", ...report.priorities.map((p, i) => `${i + 1}. ${p}`), "");
  lines.push("## Findings", ...report.findings.map((f) => `- **${f.title}** ${f.detail}`), "");
  lines.push("## Recommendations", ...report.recommendations.map((r) => `- [P${r.priority}] **${r.action}** - ${r.reason}`), "");
  lines.push("## Forecasts", "| target | model | next months | model MAE | naive MAE |", "|---|---|---|---|---|");
  for (const f of report.forecasts) {
    lines.push(`| ${f.target} | ${f.model} | ${f.forecast.map((p) => `${p.month.slice(0, 7)}: ${f2(p.value)}`).join(", ")} | ${f2(f.backtest_mae)} | ${f2(f.naive_mae)} |`);
  }
  const e = report.evaluation as Record<string, unknown>;
  lines.push("", "## Check against history", `- Checks passed: ${e["checks_passed"]}`,
    `- Model beats naive forecast in ${f2(e["model_win_rate_vs_naive"])}% of tested series`);
  return lines.join("\n");
}

export async function generateMonthlyReport(language: Lang = "ar", useLlm = true, save = true): Promise<RecommendationReport> {
  const [data, referenceDate] = await Promise.all([loadHistory(), getReferenceDate()]);
  const report = buildRecommendations(data, referenceDate, language);
  const fallback = () => {
    report.summary = report.findings.map((f) => f.detail).filter(Boolean).join(" ");
    report.priorities = report.recommendations.slice(0, 5).map((r) => r.action);
  };
  if (useLlm) {
    try {
      const out = await chatJson<{ summary: string; priorities: string[] }>({
        instructions: recommendationSystemPrompt(language),
        user: buildRecommendationPrompt(
          report.findings.map((f) => ({ title: f.title, detail: f.detail })),
          report.forecasts.slice(0, 3).map((f) => ({ target: f.target, forecast: f.forecast })),
          report.recommendations.map((r) => ({ action: r.action, reason: r.reason, priority: r.priority })),
          report.last_complete_month),
        schema: strictObject({ summary: { type: "string" }, priorities: { type: "array", items: { type: "string" } } }),
      });
      report.summary = String(out.summary ?? "").trim();
      report.priorities = (out.priorities ?? []).map(String).slice(0, 5);
    } catch (error) {
      if (!(error instanceof LLMError)) throw error;
      console.warn("LLM summary skipped:", error.message);
    }
    if (!report.summary) fallback();
  } else {
    fallback();
  }
  if (save) {
    const db = await adminDb();
    const { data: row } = await db.from("monthly_reports").insert({
      period: report.last_complete_month, language, report: report as never, markdown: toMarkdown(report),
    }).select("id").single();
    report.saved_to = row ? [`monthly_reports/${row.id}`] : [];
  }
  return report;
}
