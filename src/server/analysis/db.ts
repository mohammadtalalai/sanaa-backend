/** Read-only analytics access through the database's `run_analytics_sql` sandbox (role ai_readonly). */
import { adminDb } from "@/server/core/supabase";

export class SQLExecutionError extends Error {}

export type Row = Record<string, unknown>;

export async function executeReadonly(sql: string, maxRows: number): Promise<{ rows: Row[]; row_count: number; truncated: boolean }> {
  const db = await adminDb();
  const { data, error } = await db.rpc("run_analytics_sql", { p_sql: sql, p_max_rows: maxRows });
  if (error) throw new SQLExecutionError(error.message.split("\n")[0] ?? "Query failed");
  const all = (data as Row[] | null) ?? [];
  const truncated = all.length > maxRows;
  const rows = truncated ? all.slice(0, maxRows) : all;
  return { rows, row_count: rows.length, truncated };
}

/** Fixed internal queries (recommendations etc.) — no row cap beyond 5000. */
export async function fetchAll(sql: string): Promise<Row[]> {
  return (await executeReadonly(sql, 5000)).rows;
}

/** The dataset reference date (analytics.v_as_of), falling back to today. */
export async function getReferenceDate(): Promise<string> {
  try {
    const rows = await fetchAll("SELECT as_of FROM analytics.v_as_of");
    const value = rows[0]?.["as_of"];
    if (value) return String(value).slice(0, 10);
  } catch (error) {
    console.warn("Could not read analytics.v_as_of", error);
  }
  return new Date().toISOString().slice(0, 10);
}
