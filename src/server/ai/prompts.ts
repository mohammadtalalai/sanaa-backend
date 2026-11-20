/** Prompt templates (copied from app/prompts/*.txt) and prompt builders (port of app/ai/prompts.py). */
import analysisPrompt from "./prompts/analysis_prompt.txt?raw";
import customerPrompt from "./prompts/customer_prompt.txt?raw";
import recommendationPrompt from "./prompts/recommendation_prompt.txt?raw";
import reportPrompt from "./prompts/report_prompt.txt?raw";

const PROMPTS = {
  analysis_prompt: analysisPrompt,
  customer_prompt: customerPrompt,
  recommendation_prompt: recommendationPrompt,
  report_prompt: reportPrompt,
};
const LANGUAGE_NAMES: Record<string, string> = { ar: "Arabic (Egyptian business Arabic)", en: "English" };

/** Replace {name} placeholders only for the given keys (the templates also contain literal JSON braces). */
export function render(name: keyof typeof PROMPTS, values: Record<string, string>): string {
  let text = PROMPTS[name];
  for (const [key, value] of Object.entries(values)) text = text.split(`{${key}}`).join(value);
  return text;
}

export const sqlSystemPrompt = (maxRows: number) => render("analysis_prompt", { max_rows: String(maxRows) });
export const reportSystemPrompt = (language: string) =>
  render("report_prompt", { language: LANGUAGE_NAMES[language] ?? "English" });
export const recommendationSystemPrompt = (language: string) =>
  render("recommendation_prompt", { language: LANGUAGE_NAMES[language] ?? "English" });

export function buildSqlPrompt(question: string, context: string, views: string[], referenceDate: string | null,
                               previousError?: string | null, previousSql?: string | null): string {
  const parts = [
    `DATASET REFERENCE DATE (analytics.v_as_of): ${referenceDate ?? "unknown"}`,
    "ALLOWED VIEWS: " + views.map((v) => `analytics.${v}`).join(", "),
    `KNOWLEDGE:\n${context}`,
    `QUESTION:\n${question}`,
  ];
  if (previousError) {
    parts.push(`YOUR PREVIOUS SQL FAILED.\nSQL:\n${previousSql}\nERROR:\n${previousError}\nFix the SQL and answer again with the same JSON format.`);
  }
  return parts.join("\n\n");
}

export function buildReportPrompt(question: string, sql: string, rows: unknown[], referenceDate: string | null,
                                  truncated: boolean, notes: string[] = [], comparison: unknown = null): string {
  const data = JSON.stringify(rows);
  const shown = truncated ? "\n(Only the first rows are shown.)" : "";
  const dataNotes = notes.map((n) => `\n- ${n}`).join("");
  const important = dataNotes
    ? `\nIMPORTANT DATA NOTES (mention them and do not draw trend conclusions that ignore them):${dataNotes}` : "";
  const computed = comparison
    ? `\nCOMPUTED COMPARISON (exact - use these percentages, do not recalculate):\n${JSON.stringify(comparison)}` : "";
  return `DATASET REFERENCE DATE: ${referenceDate ?? "unknown"}${important}${computed}\n\nQUESTION:\n${question}\n\nSQL USED:\n${sql}\n\nROWS (${rows.length}):\n${data}${shown}`;
}

export function buildRecommendationPrompt(findings: unknown, forecasts: unknown, recommendations: unknown, period: string) {
  return `PERIOD ANALYSED: ${period}\n\nFINDINGS:\n${JSON.stringify(findings)}\n\nFORECASTS:\n${JSON.stringify(forecasts)}\n\nRULE-BASED RECOMMENDATIONS:\n${JSON.stringify(recommendations)}`;
}
