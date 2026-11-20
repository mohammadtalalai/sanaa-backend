/** Phase 1 pipeline: question -> knowledge -> SQL -> validation -> execution -> report (port of analyzer.py). */
import { chatJson, LLMError, strictObject } from "@/server/ai/gateway";
import { retrieve } from "@/server/ai/knowledge";
import { buildSqlPrompt, sqlSystemPrompt } from "@/server/ai/prompts";
import { ServiceUnavailableError, ValidationFailedError } from "@/server/core/http";
import { detectLanguage, type Language } from "@/shared/language";
import { SQLExecutionError, executeReadonly, getReferenceDate, type Row } from "./db";
import { emptyReport, generateReport, type Report } from "./report";
import { SQLValidator } from "./sql-validator";

export const MAX_SQL_ROWS = 100;
export const MAX_QUESTION_LENGTH = 2000;
export const MAX_SQL_ATTEMPTS = 3;

const NOT_ANSWERABLE = { ar: "لا أستطيع الإجابة على هذا السؤال من البيانات المتاحة. ", en: "I can't answer this question from the available data. " };
const FAILED = { ar: "لم أتمكن من بناء استعلام صحيح لهذا السؤال. جرّب صياغة أوضح.", en: "I could not build a valid query for this question. Try rephrasing it." };

export type AskResult = {
  success: boolean;
  question: string;
  language: Language;
  domain: string;
  domains: string[];
  reference_date: string;
  sql: string | null;
  reason: string;
  rows: Row[];
  row_count: number;
  truncated: boolean;
  attempts: number;
  errors: string[];
  report: Report;
  elapsed_ms: number;
  saved_report?: string | null;
};

type Plan = { answerable: boolean; sql: string; reason: string };

async function generatePlan(question: string, knowledge: ReturnType<typeof retrieve>, referenceDate: string,
                            previousError: string | null, previousSql: string | null): Promise<Plan> {
  const data = await chatJson<Plan>({
    instructions: sqlSystemPrompt(MAX_SQL_ROWS),
    user: buildSqlPrompt(question, knowledge.context, knowledge.views, referenceDate, previousError, previousSql),
    schema: strictObject({ answerable: { type: "boolean" }, sql: { type: "string" }, reason: { type: "string" } }),
    effort: "medium",
  });
  return { answerable: Boolean(data.answerable), sql: String(data.sql ?? ""), reason: String(data.reason ?? "") };
}

export async function ask(questionInput: string, languageInput?: Language | null): Promise<AskResult> {
  const question = (questionInput ?? "").trim();
  if (!question) throw new ValidationFailedError("The question is empty");
  if (question.length > MAX_QUESTION_LENGTH) throw new ValidationFailedError(`The question is longer than ${MAX_QUESTION_LENGTH} characters`);
  const language: Language = languageInput === "ar" || languageInput === "en" ? languageInput : detectLanguage(question);
  const start = Date.now();
  const knowledge = retrieve(question);
  const referenceDate = await getReferenceDate();
  const result: AskResult = {
    success: true, question, language, domain: knowledge.domain, domains: knowledge.domains, reference_date: referenceDate,
    sql: null, reason: "", rows: [], row_count: 0, truncated: false, attempts: 0, errors: [], report: emptyReport(""), elapsed_ms: 0,
  };
  const validator = new SQLValidator(undefined, MAX_SQL_ROWS);
  let previousError: string | null = null, previousSql: string | null = null;
  let execution: Awaited<ReturnType<typeof executeReadonly>> | null = null;
  const finish = () => { result.elapsed_ms = Date.now() - start; return result; };
  try {
    for (let attempt = 1; attempt <= MAX_SQL_ATTEMPTS; attempt++) {
      result.attempts = attempt;
      const plan = await generatePlan(question, knowledge, referenceDate, previousError, previousSql);
      result.reason = plan.reason;
      if (!plan.answerable) {
        result.report = emptyReport(NOT_ANSWERABLE[language] + plan.reason);
        return finish();
      }
      const check = validator.validate(plan.sql);
      if (!check.valid) {
        previousError = check.error; previousSql = plan.sql;
        result.errors.push(`validation: ${check.error}`);
        continue;
      }
      try {
        execution = await executeReadonly(check.sql, MAX_SQL_ROWS);
        result.sql = check.sql;
        break;
      } catch (error) {
        if (!(error instanceof SQLExecutionError)) throw error;
        previousError = error.message; previousSql = check.sql;
        result.errors.push(`database: ${error.message}`);
      }
    }
  } catch (error) {
    if (error instanceof LLMError) throw new ServiceUnavailableError(`The AI model is not available: ${error.message}`);
    throw error;
  }
  if (!execution) {
    result.report = emptyReport(FAILED[language]);
    return finish();
  }
  Object.assign(result, { rows: execution.rows, row_count: execution.row_count, truncated: execution.truncated });
  result.report = await generateReport(question, result.sql!, execution.rows, language, referenceDate, execution.truncated);
  return finish();
}
