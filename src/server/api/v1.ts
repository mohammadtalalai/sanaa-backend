/**
 * /api/v1 — ERP REST for staff apps (web, mobile). Every call acts as the signed-in user, so database
 * access rules decide what each person can read and change.
 */
import { z } from "zod";
import { requireStaff } from "@/server/core/auth";
import { NotFoundError, UnauthorizedError, ValidationFailedError, json, readJson } from "@/server/core/http";
import { anonAuthDb } from "@/server/core/supabase";

/** resource -> table, primary key, default order, filterable columns */
export const RESOURCES: Record<string, { table: string; key: string; order: string; filters: string[]; select?: string }> = {
  orders: { table: "orders", key: "id", order: "created_at", filters: ["status", "customer_id", "branch_id", "order_type", "channel", "order_no"],
    select: "*, customer:customers(id,name,phone,city), lines:order_lines(*), payments(*)" },
  "order-lines": { table: "order_lines", key: "id", order: "id", filters: ["order_id", "product_id"] },
  payments: { table: "payments", key: "id", order: "paid_at", filters: ["order_id", "method"] },
  customers: { table: "customers", key: "id", order: "created_at", filters: ["phone", "city", "customer_type", "source"] },
  products: { table: "products", key: "id", order: "id", filters: ["sku", "category_code", "active", "catalog_type"] },
  categories: { table: "product_categories", key: "code", order: "code", filters: [] },
  branches: { table: "branches", key: "id", order: "id", filters: ["code", "branch_type", "city"] },
  "sales-reps": { table: "sales_reps", key: "id", order: "id", filters: ["branch_id"] },
  production: { table: "production_orders", key: "id", order: "id", filters: ["status", "order_id", "product_id", "po_no"] },
  materials: { table: "materials", key: "id", order: "id", filters: ["sku", "material_type", "supplier_id"] },
  suppliers: { table: "suppliers", key: "id", order: "id", filters: [] },
  "purchase-orders": { table: "purchase_orders", key: "id", order: "ordered_at", filters: ["supplier_id"] },
  expenses: { table: "branch_expenses", key: "id", order: "month_start", filters: ["branch_id", "month_start", "category"] },
  shipments: { table: "shipments", key: "id", order: "id", filters: ["order_id"] },
  boms: { table: "boms", key: "id", order: "id", filters: ["status", "code"] },
  "quality-checks": { table: "quality_checks", key: "id", order: "id", filters: ["status", "order_id"] },
  approvals: { table: "approvals", key: "id", order: "created_at", filters: ["status", "order_id"] },
  notifications: { table: "notifications", key: "id", order: "created_at", filters: ["read", "link"] },
  shifts: { table: "shifts", key: "id", order: "opened_at", filters: ["employee"] },
  "audit-log": { table: "audit_log", key: "id", order: "created_at", filters: ["actor"] },
  settings: { table: "factory_settings", key: "id", order: "id", filters: [] },
  tenants: { table: "tenants", key: "id", order: "id", filters: ["status", "plan"] },
  plans: { table: "plans", key: "code", order: "code", filters: [] },
  "feature-flags": { table: "feature_flags", key: "key", order: "sort", filters: ["enabled"] },
  announcements: { table: "announcements", key: "id", order: "created_at", filters: ["status"] },
  quotations: { table: "quotations", key: "quotation_no", order: "created_at", filters: ["status", "customer_phone", "session_id"] },
  designs: { table: "designs", key: "design_id", order: "created_at", filters: ["status", "quotation_no"] },
};

const OWNER_FIELDS: Record<string, string> = { orders: "created_by", customers: "created_by", payments: "recorded_by", approvals: "requested_by", shifts: "employee" };

function dbError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) {
    throw new UnauthorizedError("Your account is not allowed to do this", { reason: error.message });
  }
  throw new ValidationFailedError(error.message, { code: error.code });
}

export async function handleV1(request: Request, path: string[], url: URL): Promise<Response> {
  // ---- auth for apps (email + password) ----
  if (path[0] === "auth") {
    const auth = anonAuthDb().auth;
    if (path[1] === "login" && request.method === "POST") {
      const body = await readJson(request, z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }));
      const { data, error } = await auth.signInWithPassword(body);
      if (error || !data.session) throw new UnauthorizedError("Wrong email or password");
      const s = data.session;
      return json({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, token_type: "bearer", user: { id: data.user.id, email: data.user.email } });
    }
    if (path[1] === "refresh" && request.method === "POST") {
      const body = await readJson(request, z.object({ refresh_token: z.string().min(10).max(2000) }));
      const { data, error } = await auth.refreshSession({ refresh_token: body.refresh_token });
      if (error || !data.session) throw new UnauthorizedError("Session expired, please log in again");
      const s = data.session;
      return json({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, token_type: "bearer" });
    }
    throw new NotFoundError("Unknown auth endpoint");
  }

  const staff = await requireStaff(request);
  const db = staff.db as any;

  if (path[0] === "me" && request.method === "GET") {
    return json({ id: staff.userId, email: staff.email, name: staff.name, roles: staff.roles });
  }
  if (path[0] === "dashboard" && request.method === "GET") {
    const { data, error } = await db.rpc("dashboard_summary");
    dbError(error);
    return json(data);
  }
  if (path[0] === "resources" && request.method === "GET") {
    return json({ resources: Object.entries(RESOURCES).map(([name, r]) => ({ name, key: r.key, filters: r.filters })) });
  }

  const resource = RESOURCES[path[0] ?? ""];
  if (!resource || path.length > 2) throw new NotFoundError(`Unknown resource ${path[0] ?? ""}`);
  const id = path[1] ? decodeURIComponent(path[1]) : null;
  const table = db.from(resource.table);

  if (request.method === "GET" && !id) {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 500);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
    let query = table.select(resource.select ?? "*", { count: "exact" });
    for (const f of resource.filters) {
      const v = url.searchParams.get(f);
      if (v !== null && v !== "") query = query.eq(f, v);
    }
    const q = url.searchParams.get("q");
    if (q && ["customers"].includes(path[0]!)) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,phone.ilike.%${q.replace(/[%,()]/g, "")}%`);
    if (q && ["products", "materials"].includes(path[0]!)) query = query.or(`name_ar.ilike.%${q.replace(/[%,()]/g, "")}%,name_en.ilike.%${q.replace(/[%,()]/g, "")}%,sku.ilike.%${q.replace(/[%,()]/g, "")}%`);
    const ascending = url.searchParams.get("order") === "asc";
    const { data, error, count } = await query.order(resource.order, { ascending }).range(offset, offset + limit - 1);
    dbError(error);
    return json({ data, count, limit, offset });
  }
  if (request.method === "GET" && id) {
    const { data, error } = await table.select(resource.select ?? "*").eq(resource.key, id).maybeSingle();
    dbError(error);
    if (!data) throw new NotFoundError("Not found");
    return json(data);
  }
  if (request.method === "POST" && !id) {
    const body = await readJson(request, z.record(z.string(), z.unknown()));
    const owner = OWNER_FIELDS[path[0]!];
    if (owner) body[owner] = staff.userId;
    const { data, error } = await table.insert(body).select("*").single();
    dbError(error);
    return json(data, 201);
  }
  if ((request.method === "PATCH" || request.method === "PUT") && id) {
    const body = await readJson(request, z.record(z.string(), z.unknown()));
    delete body[resource.key];
    const { data, error } = await table.update(body).eq(resource.key, id).select("*").maybeSingle();
    dbError(error);
    if (!data) throw new NotFoundError("Not found or not allowed");
    return json(data);
  }
  if (request.method === "DELETE" && id) {
    const { data, error } = await table.delete().eq(resource.key, id).select(resource.key);
    dbError(error);
    if (!data?.length) throw new NotFoundError("Not found or not allowed");
    return json({ deleted: true });
  }
  throw new NotFoundError("Unknown endpoint");
}
