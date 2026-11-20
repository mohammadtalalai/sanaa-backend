/** Chat sessions, quotations and designs in the database (port of repository.py PostgresRepository). */
import { adminDb } from "@/server/core/supabase";

export type SessionState = {
  session_id: string;
  language: "ar" | "en";
  status: string;
  awaiting: string | null;
  data: Record<string, string | number>;
  quotation_no: string | null;
  design_id: string | null;
  history: { role: string; text: string; at: string }[];
  created_at: string;
  updated_at: string;
};
export type Quotation = Record<string, any> & { quotation_no: string; session_id: string | null };
export type Design = Record<string, any> & { design_id: string; quotation_no: string; session_id: string | null };

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(`Database error: ${error.message}`);
};

export async function saveSession(state: SessionState) {
  const db = await adminDb();
  const { error } = await db.from("chat_sessions").upsert({
    session_id: state.session_id, language: state.language, status: state.status, state: state as never,
    created_at: state.created_at, updated_at: state.updated_at,
  });
  fail(error);
}
export async function getSession(sessionId: string): Promise<SessionState | null> {
  const db = await adminDb();
  const { data, error } = await db.from("chat_sessions").select("state").eq("session_id", sessionId).maybeSingle();
  fail(error);
  return (data?.state as unknown as SessionState) ?? null;
}
export async function saveQuotation(q: Quotation) {
  const db = await adminDb();
  const { error } = await db.from("quotations").upsert(q as never);
  fail(error);
}
export async function getQuotation(no: string): Promise<Quotation | null> {
  const db = await adminDb();
  const { data, error } = await db.from("quotations").select("*").eq("quotation_no", no).maybeSingle();
  fail(error);
  if (!data) return null;
  return { ...data, total: Number(data.total) } as Quotation;
}
export async function updateQuotation(no: string, fields: Record<string, unknown>) {
  const db = await adminDb();
  const { error } = await db.from("quotations").update(fields as never).eq("quotation_no", no);
  fail(error);
}
export async function saveDesign(d: Design) {
  const db = await adminDb();
  const { error } = await db.from("designs").upsert(d as never);
  fail(error);
}
export async function getDesign(id: string): Promise<Design | null> {
  const db = await adminDb();
  const { data, error } = await db.from("designs").select("*").eq("design_id", id).maybeSingle();
  fail(error);
  return (data as Design) ?? null;
}
export async function updateDesign(id: string, fields: Record<string, unknown>) {
  const db = await adminDb();
  const { error } = await db.from("designs").update(fields as never).eq("design_id", id);
  fail(error);
}
