/** Query rows -> structured management report (port of report_generator.py). */
import { chatJson, LLMError, strictObject } from "@/server/ai/gateway";
import { buildReportPrompt, reportSystemPrompt } from "@/server/ai/prompts";
import type { Row } from "./db";

const MAX_ROWS_FOR_MODEL = 40;
const PARTIAL_MONTH_NOTE = {
  ar: "تنبيه: شهر {month} لم يكتمل بعد (تاريخ البيانات {date})، والمصروفات التشغيلية قد لا تكون مسجلة، لذلك صافي الربح لهذا الشهر غير نهائي.",
  en: "Note: {month} is not complete yet (data as of {date}) and operating expenses may not be recorded, so its net profit is not final.",
};
const FACTORY_NOTE = {
  ar: "ملاحظة: صفوف المصنع ليس لها إيرادات وتتحمل التكاليف المركزية، لذلك تظهر بخسارة؛ قارن فروع البيع فيما بينها.",
  en: "Note: factory rows have no revenue and carry central costs, so they show a loss; compare the sales branches among themselves.",
};
const PERIOD_COLUMNS = ["month_start", "sale_month", "sale_date"];
const RUN_RATE_NOTE = {
  ar: "بمعدل البيع الحالي ({days} من {month_days} يوم)، المتوقع لشهر {month} كامل: {column} {estimate} ({change} مقارنة بـ {previous_period}).",
  en: "At the current pace ({days} of {month_days} days), the full month {month} would reach {column} {estimate} ({change} vs {previous_period}).",
};
const METRIC_LABELS: Record<string, Record<string, string>> = {
  ar: { net_revenue: "صافي الإيرادات", revenue: "الإيرادات", units: "عدد القطع", orders: "عدد الطلبات", net_profit: "صافي الربح", gross_profit: "مجمل الربح" },
  en: { net_revenue: "net revenue", revenue: "revenue", units: "units", orders: "orders", net_profit: "net profit", gross_profit: "gross profit" },
};
const NON_ADDITIVE = ["pct", "margin", "avg", "rate", "_id", "price"];
const NO_DATA = { ar: "لا توجد بيانات تطابق هذا السؤال في الفترة المتاحة.", en: "No data matches this question in the available period." };
const FALLBACK_INTRO = { ar: "نتيجة الاستعلام:", en: "Query result:" };

type Lang = "ar" | "en";
const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
const r2 = (v: number) => Math.round(v * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const money0 = (v: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);

export type Report = {
  answer: string;
  highlights: string[];
  recommendations: string[];
  statistics: Record<string, { min: number; max: number; sum: number; avg: number }>;
  columns: string[];
  notes: string[];
  comparison: Record<string, unknown> | null;
};

export function emptyReport(answer: string): Report {
  return { answer, highlights: [], recommendations: [], statistics: {}, columns: [], notes: [], comparison: null };
}

/** min / max / sum / avg for every numeric column (exact). */
export function summarizeColumns(rows: Row[]): Report["statistics"] {
  const stats: Report["statistics"] = {};
  if (!rows.length) return stats;
  for (const column of Object.keys(rows[0]!)) {
    const values = rows.map((r) => r[column]).filter(isNum);
    const nonNull = rows.filter((r) => r[column] !== null && r[column] !== undefined).length;
    if (values.length && values.length === nonNull) {
      const sum = values.reduce((a, b) => a + b, 0);
      stats[column] = { min: r2(Math.min(...values)), max: r2(Math.max(...values)), sum: r2(sum), avg: r2(sum / values.length) };
    }
  }
  return stats;
}

export function dataNotes(rows: Row[], language: Lang, referenceDate: string | null): string[] {
  const notes: string[] = [];
  if (!rows.length) return notes;
  if (referenceDate) {
    const current = referenceDate.slice(0, 7);
    if (rows.some((row) => PERIOD_COLUMNS.some((c) => String(row[c] ?? "").slice(0, 7) === current))) {
      notes.push(fill(PARTIAL_MONTH_NOTE[language], { month: current, date: referenceDate }));
    }
  }
  if (rows.some((row) => String(row["branch_type"] ?? "").toLowerCase() === "factory")) notes.push(FACTORY_NOTE[language]);
  return notes;
}

/** Exact change between the last two periods; full-month estimate when the last one is the partial month. */
export function periodComparison(rows: Row[], referenceDate: string | null): Record<string, any> | null {
  if (rows.length < 2) return null;
  const column = PERIOD_COLUMNS.find((c) => c in rows[0]!);
  if (!column) return null;
  const byPeriod = new Map<string, Row>();
  for (const row of rows) {
    const key = String(row[column]).slice(0, 10);
    if (!byPeriod.has(key)) byPeriod.set(key, row);
  }
  if (byPeriod.size !== rows.length) return null;
  const sorted = [...byPeriod.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const [previousPeriod, previous] = sorted[sorted.length - 2]!;
  const [currentPeriod, current] = sorted[sorted.length - 1]!;
  const partial = !!referenceDate && currentPeriod.slice(0, 7) === referenceDate.slice(0, 7) && column !== "sale_date";
  let days: number | null = null, monthDays: number | null = null;
  if (partial && referenceDate) {
    const ref = new Date(`${referenceDate.slice(0, 10)}T00:00:00Z`);
    days = ref.getUTCDate();
    monthDays = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0)).getUTCDate();
  }
  const changes: Record<string, Record<string, number | null>> = {};
  for (const [key, value] of Object.entries(current)) {
    if (key === column || !isNum(value) || !isNum(previous[key])) continue;
    const before = previous[key] as number;
    const entry: Record<string, number | null> = {
      previous: before, current: value, change_pct: before ? r2(((value - before) / Math.abs(before)) * 100) : null,
    };
    if (partial && days && monthDays && !NON_ADDITIVE.some((w) => key.toLowerCase().includes(w))) {
      const estimate = r2((value / days) * monthDays);
      entry["full_month_estimate"] = estimate;
      entry["estimated_change_pct"] = before ? r2(((estimate - before) / Math.abs(before)) * 100) : null;
    }
    changes[key] = entry;
  }
  if (!Object.keys(changes).length) return null;
  return { period_column: column, previous_period: previousPeriod, current_period: currentPeriod, current_is_partial: partial,
    days_elapsed: days, days_in_month: monthDays, changes };
}

export function comparisonNotes(comparison: Record<string, any> | null, language: Lang): string[] {
  if (!comparison || !comparison["current_is_partial"]) return [];
  const preferred = ["net_revenue", "revenue", "units", "orders", "net_profit", "gross_profit"];
  const key = preferred.find((k) => comparison["changes"][k] && "full_month_estimate" in comparison["changes"][k]);
  if (!key) return [];
  const entry = comparison["changes"][key];
  const change = entry.estimated_change_pct as number | null;
  return [fill(RUN_RATE_NOTE[language], {
    days: comparison["days_elapsed"], month_days: comparison["days_in_month"], month: String(comparison["current_period"]).slice(0, 7),
    column: METRIC_LABELS[language]![key]!, estimate: money0(entry.full_month_estimate),
    change: change === null ? "n/a" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    previous_period: String(comparison["previous_period"]).slice(0, 7),
  })];
}

function fallbackAnswer(rows: Row[], language: Lang): string {
  const lines = rows.slice(0, 5).map((row) => Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(", "));
  return `${FALLBACK_INTRO[language]}\n${lines.join("\n")}`;
}

const asList = (value: unknown) =>
  Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : typeof value === "string" && value.trim() ? [value.trim()] : [];

export async function generateReport(question: string, sql: string, rows: Row[], language: Lang,
                                     referenceDate: string | null, truncated = false): Promise<Report> {
  const report: Report = {
    answer: "", highlights: [], recommendations: [], statistics: summarizeColumns(rows),
    columns: rows.length ? Object.keys(rows[0]!) : [], notes: dataNotes(rows, language, referenceDate),
    comparison: periodComparison(rows, referenceDate),
  };
  report.notes.push(...comparisonNotes(report.comparison, language));
  if (!rows.length) {
    report.answer = NO_DATA[language];
    return report;
  }
  const prompt = buildReportPrompt(question, sql, rows.slice(0, MAX_ROWS_FOR_MODEL), referenceDate,
    rows.length > MAX_ROWS_FOR_MODEL || truncated, report.notes, report.comparison);
  try {
    const data = await chatJson<{ answer: string; highlights: string[]; recommendations: string[] }>({
      instructions: reportSystemPrompt(language),
      user: prompt,
      schema: strictObject({
        answer: { type: "string" },
        highlights: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
      }),
    });
    report.answer = String(data.answer ?? "").trim() || fallbackAnswer(rows, language);
    report.highlights = asList(data.highlights).slice(0, 4);
    report.recommendations = asList(data.recommendations).slice(0, 3);
  } catch (error) {
    if (!(error instanceof LLMError)) throw error;
    console.warn("Report generation failed, using plain result:", error.message);
    report.answer = fallbackAnswer(rows, language);
  }
  return report;
}

export function reportMarkdown(result: { question: string; sql: string | null; report: Report }): string {
  const r = result.report;
  const lines = [`# ${result.question}`, "", r.answer, "", ...r.notes.map((n) => `> ${n}`), ""];
  if (r.highlights.length) lines.push("## Highlights", ...r.highlights.map((h) => `- ${h}`), "");
  if (r.recommendations.length) lines.push("## Recommendations", ...r.recommendations.map((h) => `- ${h}`), "");
  lines.push("## SQL", "```sql", result.sql ?? "", "```");
  return lines.join("\n");
}
