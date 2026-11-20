/**
 * One REST API for the website and any future mobile app.
 * Paths match the SANAA AI model (/api/health, /api/internal/*, /api/customer/*) plus /api/v1/* for the ERP.
 */
import { z } from "zod";
import { gatewayHealth } from "@/server/ai/gateway";
import { ask } from "@/server/analysis/analyzer";
import { reportMarkdown } from "@/server/analysis/report";
import { getReferenceDate } from "@/server/analysis/db";
import { validateReadonlySql, EXPECTED_VIEWS } from "@/server/analysis/sql-validator";
import { requireCustomer, requireInternal } from "@/server/core/auth";
import {
  CORS_HEADERS, NotFoundError, ServiceUnavailableError, TooManyRequestsError, UnauthorizedError, ValidationFailedError,
  clientIp, json, publicOrigin, readJson, toErrorResponse,
} from "@/server/core/http";
import { adminDb } from "@/server/core/supabase";
import { CustomerChatbot } from "@/server/customer/chatbot";
import { createDesign, decideDesign, designFile, getOwnDesign, withOrigin } from "@/server/customer/designs";
import { getQuotation } from "@/server/customer/repository";
import { checkLoginRate, login, myOrders, track } from "@/server/customer/tracking";
import { generateMonthlyReport } from "@/server/recommendations/recommender";
import { synthesize, transcribe } from "@/server/voice";
import { buildDesignSpec, buildGlb, renderPreviewSvg, verifyDimensions } from "@/shared/design";
import { validateItem } from "@/shared/costing";
import { getCatalog } from "@/shared/catalog";
import { handleV1 } from "./v1";

export const VERSION = "1.0.0";
const lang = z.enum(["ar", "en"]).nullish();

type Ctx = { request: Request; path: string[]; url: URL };
type Handler = (ctx: Ctx, params: Record<string, string>) => Promise<Response>;
type RouteDef = { method: string; pattern: string; handler: Handler };

const sessionHeader = (request: Request) => {
  const id = request.headers.get("x-session-id");
  if (!id) throw new UnauthorizedError("X-Session-ID header is required");
  return id;
};
const queryLang = (url: URL) => (url.searchParams.get("language") === "en" ? "en" : "ar");

async function saveAnalysis(result: Awaited<ReturnType<typeof ask>>, userId: string | null) {
  const db = await adminDb();
  const { data } = await db.from("analysis_reports").insert({
    question: result.question, language: result.language, sql: result.sql, result: { ...result, markdown: reportMarkdown(result as never) } as never,
    created_by: userId,
  }).select("id").single();
  return data ? `analysis_reports/${data.id}` : null;
}

async function audioForm(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) throw new ValidationFailedError("Send the audio as multipart/form-data with an 'audio' file");
  const file = form.get("audio") ?? form.get("file");
  if (!(file instanceof File)) throw new ValidationFailedError("Field 'audio' (file) is required");
  const language = form.get("language");
  return { file, language: typeof language === "string" ? language : null };
}

const ROUTES: RouteDef[] = [
  // ---------- health ----------
  { method: "GET", pattern: "", handler: async () => json({ service: "SANAA API", version: VERSION, health: "/api/health" }) },
  { method: "GET", pattern: "health", handler: async () => json({ status: "ok", service: "SANAA API", environment: "cloud", version: VERSION }) },
  { method: "GET", pattern: "health/database", handler: async () => {
    try {
      const db = await adminDb();
      const { data, error } = await db.rpc("analytics_views_info");
      if (error) throw error;
      return json({ status: "ok", database: "connected", views: Object.keys((data as object) ?? {}).length, reference_date: await getReferenceDate() });
    } catch (error) {
      throw new ServiceUnavailableError(`Database is not reachable: ${String((error as Error).message ?? error).split("\n")[0]}`);
    }
  } },
  { method: "GET", pattern: "health/views", handler: async ({ request }) => {
    await requireInternal(request);
    const db = await adminDb();
    const { data, error } = await db.rpc("analytics_views_info");
    if (error) throw new ServiceUnavailableError(`Database is not reachable: ${error.message}`);
    const found = (data ?? {}) as Record<string, string[]>;
    const views = Object.fromEntries(Object.entries(EXPECTED_VIEWS).map(([view, columns]) => {
      const actual = found[view] ?? [];
      return [view, { exists: actual.length > 0, missing_columns: columns.filter((c) => !actual.includes(c)) }];
    }));
    return json({ ok: Object.values(views).every((v) => v.exists && !v.missing_columns.length), views });
  } },
  ...["health/ollama", "health/ai"].map((pattern) => ({ method: "GET", pattern, handler: async () => {
    const info = await gatewayHealth();
    if (!info["reachable"]) throw new ServiceUnavailableError("AI service is not reachable", info);
    return json({ status: info["model_installed"] ? "ok" : "model_missing", ...info });
  } })),

  // ---------- internal (managers / X-API-Key) ----------
  { method: "POST", pattern: "internal/ask", handler: async ({ request }) => {
    const caller = await requireInternal(request);
    const body = await readJson(request, z.object({ question: z.string().min(2).max(2000), language: lang, save_report: z.boolean().optional() }));
    const result = await ask(body.question, body.language ?? null);
    result.saved_report = body.save_report && result.sql ? await saveAnalysis(result, caller.userId) : null;
    return json(result);
  } },
  { method: "POST", pattern: "internal/sql/validate", handler: async ({ request }) => {
    await requireInternal(request);
    const body = await readJson(request, z.object({ sql: z.string().min(1).max(10000) }));
    const r = validateReadonlySql(body.sql);
    return json({ valid: r.valid, sql: r.sql, error: r.error, tables: r.tables });
  } },
  { method: "POST", pattern: "internal/voice/transcribe", handler: async ({ request }) => {
    await requireInternal(request);
    const { file, language } = await audioForm(request);
    return json(await transcribe(file, language));
  } },
  { method: "POST", pattern: "internal/voice/ask", handler: async ({ request }) => {
    await requireInternal(request);
    const { file, language } = await audioForm(request);
    const heard = await transcribe(file, language);
    const result = await ask(heard.text, heard.language);
    return json({ ...result, saved_report: null, transcript: heard.text, audio_language: heard.language });
  } },
  { method: "POST", pattern: "internal/voice/speak", handler: async ({ request }) => {
    await requireInternal(request);
    const body = await readJson(request, z.object({ text: z.string().min(1).max(3000), language: lang }));
    return synthesize(body.text, body.language ?? null);
  } },
  { method: "POST", pattern: "internal/recommendations", handler: async ({ request }) => {
    await requireInternal(request);
    const body = await readJson(request, z.object({ language: z.enum(["ar", "en"]).default("ar"), use_llm: z.boolean().default(true), save: z.boolean().default(true) }));
    return json(await generateMonthlyReport(body.language, body.use_llm, body.save));
  } },
  { method: "GET", pattern: "internal/reports", handler: async ({ request }) => {
    await requireInternal(request);
    const db = await adminDb();
    const [analysis, monthly] = await Promise.all([
      db.from("analysis_reports").select("id, question, language, sql, created_at").order("created_at", { ascending: false }).limit(50),
      db.from("monthly_reports").select("id, period, language, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    return json({ analysis_reports: analysis.data ?? [], monthly_reports: monthly.data ?? [] });
  } },
  { method: "GET", pattern: "internal/reports/monthly/:id", handler: async ({ request }, p) => {
    await requireInternal(request);
    const db = await adminDb();
    const { data } = await db.from("monthly_reports").select("*").eq("id", Number(p["id"])).maybeSingle();
    if (!data) throw new NotFoundError("Report not found");
    return json(data);
  } },

  // ---------- customer: chatbot + quotation + design ----------
  { method: "POST", pattern: "customer/chat", handler: async ({ request }) => {
    const body = await readJson(request, z.object({ message: z.string().min(1).max(1000), session_id: z.string().max(64).nullish(), language: lang }));
    const bot = new CustomerChatbot({ origin: publicOrigin(request) });
    return json(await bot.handle(body.message, body.session_id ?? null, body.language ?? null));
  } },
  { method: "GET", pattern: "customer/chat/:session_id", handler: async (_c, p) => json(await new CustomerChatbot().history(p["session_id"]!)) },
  { method: "GET", pattern: "customer/quotations/:no", handler: async ({ request }, p) => {
    const quotation = await getQuotation(p["no"]!);
    if (!quotation) throw new NotFoundError("Quotation not found");
    if (quotation.session_id !== sessionHeader(request)) throw new UnauthorizedError("This quotation belongs to another chat session");
    return json(quotation);
  } },
  { method: "POST", pattern: "customer/designs", handler: async ({ request }) => {
    const body = await readJson(request, z.object({ quotation_no: z.string().max(32) }));
    return json(withOrigin(await createDesign(body.quotation_no, sessionHeader(request)), publicOrigin(request)));
  } },
  { method: "GET", pattern: "customer/designs/:id", handler: async ({ request }, p) =>
    json(withOrigin(await getOwnDesign(p["id"]!, sessionHeader(request)), publicOrigin(request))) },
  { method: "POST", pattern: "customer/designs/:id/decision", handler: async ({ request }, p) => {
    const body = await readJson(request, z.object({ approved: z.boolean(), feedback: z.string().max(1000).nullish() }));
    return json(withOrigin(await decideDesign(p["id"]!, sessionHeader(request), body.approved, body.feedback ?? null), publicOrigin(request)));
  } },
  { method: "GET", pattern: "customer/designs/:id/files/:name", handler: async (_c, p) => designFile(p["id"]!, p["name"]!) },

  // ---------- live 3D preview of any spec (no stored data) ----------
  { method: "GET", pattern: "design-preview/:name", handler: async ({ url }, p) => {
    const q = url.searchParams;
    const item = {
      product_type: q.get("product_type") ?? "wardrobe", width_cm: Number(q.get("width_cm")), depth_cm: Number(q.get("depth_cm")),
      height_cm: Number(q.get("height_cm")), wood: q.get("wood") ?? "walnut", finish: q.get("finish") ?? "natural",
      color: q.get("color") ?? "natural", quantity: 1,
    };
    const known = (field: "product_type" | "wood" | "finish" | "color", key: string) => Boolean(getCatalog().options(field)[key]);
    if (!known("product_type", item.product_type) || !known("wood", item.wood) || !known("finish", item.finish) || !known("color", item.color)) {
      throw new ValidationFailedError("Unknown product, wood, finish or colour");
    }
    const problems = validateItem(item);
    if (Object.keys(problems).length) throw new ValidationFailedError("Invalid design", problems);
    const spec = buildDesignSpec("PREVIEW", item);
    const cache = { "Cache-Control": "public, max-age=600" };
    if (p["name"] === "model.glb") return new Response(buildGlb(spec) as unknown as BodyInit, { headers: { "Content-Type": "model/gltf-binary", ...cache } });
    if (p["name"] === "preview.svg") return new Response(renderPreviewSvg(spec), { headers: { "Content-Type": "image/svg+xml", ...cache } });
    if (p["name"] === "spec.json") return json({ ...spec, dimension_check: verifyDimensions(spec) });
    throw new NotFoundError("File not found");
  } },

  // ---------- customer: order tracking ----------
  { method: "POST", pattern: "customer/auth/login", handler: async ({ request }) => {
    if (!(await checkLoginRate(clientIp(request)))) throw new TooManyRequestsError("Too many login attempts, try again in a few minutes");
    const body = await readJson(request, z.object({ customer_id: z.number().int().min(1), order_no: z.string().min(1).max(40) }));
    return json(await login(body.customer_id, body.order_no));
  } },
  { method: "GET", pattern: "customer/orders", handler: async ({ request, url }) => {
    const customerId = await requireCustomer(request);
    return json({ customer_id: customerId, orders: await myOrders(customerId, queryLang(url)) });
  } },
  { method: "GET", pattern: "customer/orders/:order_no", handler: async ({ request, url }, p) => {
    const customerId = await requireCustomer(request);
    return json(await track(customerId, decodeURIComponent(p["order_no"]!), queryLang(url)));
  } },
];

function match(pattern: string, path: string[]): Record<string, string> | null {
  const parts = pattern ? pattern.split("/") : [];
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]!.startsWith(":")) params[parts[i]!.slice(1)] = decodeURIComponent(path[i]!);
    else if (parts[i] !== path[i]) return null;
  }
  return params;
}

/** Entry point used by the /api/$ and /api/public/$ server routes. */
export async function handleApi(request: Request, splat: string): Promise<Response> {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID().slice(0, 12);
  const headers = { ...CORS_HEADERS, "X-Request-ID": requestId };
  const withHeaders = (response: Response) => {
    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
    return out;
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    const url = new URL(request.url);
    const path = splat.split("/").filter(Boolean);
    if (path[0] === "v1") return withHeaders(await handleV1(request, path.slice(1), url));
    let methodMismatch = false;
    for (const route of ROUTES) {
      const params = match(route.pattern, path);
      if (!params) continue;
      if (route.method !== request.method) { methodMismatch = true; continue; }
      return withHeaders(await route.handler({ request, path, url }, params));
    }
    if (methodMismatch) return withHeaders(json({ success: false, error: { code: "method_not_allowed", message: "Method not allowed", details: {}, request_id: requestId } }, 405));
    throw new NotFoundError(`No endpoint ${request.method} /api/${path.join("/")}`);
  } catch (error) {
    return withHeaders(toErrorResponse(error, requestId));
  }
}
