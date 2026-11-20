/** Caller verification: staff bearer tokens, internal API key, customer JWT (Phase 5). */
import { SignJWT, jwtVerify } from "jose";
import { ForbiddenError, UnauthorizedError } from "./http";
import { userDb, type Db } from "./supabase";

export type Role = "admin" | "manager" | "employee";
export type StaffContext = { userId: string; email: string | null; roles: Role[]; db: Db; token: string; name: string };

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function requireStaff(request: Request, allowed?: Role[]): Promise<StaffContext> {
  const token = bearer(request);
  if (!token || token.split(".").length !== 3) throw new UnauthorizedError("Login required");
  const db = userDb(token);
  const { data, error } = await db.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new UnauthorizedError("Session expired, please log in again");
  const userId = data.claims.sub;
  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = (roleRows ?? []).map((r) => r.role as Role);
  const { data: profile } = await db.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  if (allowed && !allowed.some((r) => roles.includes(r))) {
    throw new ForbiddenError("Your account does not have permission for this action");
  }
  const email = (data.claims.email as string | undefined) ?? null;
  return { userId, email, roles, db, token, name: profile?.full_name || email || "user" };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Management routes (/api/internal/*): X-API-Key matching INTERNAL_API_KEY, or a signed-in manager.
 * Unlike the old model, there is no "open in development" mode.
 */
export async function requireInternal(request: Request): Promise<{ userId: string | null }> {
  const key = request.headers.get("x-api-key");
  const expected = process.env["INTERNAL_API_KEY"];
  if (key) {
    if (expected && timingSafeEqual(key, expected)) return { userId: null };
    throw new UnauthorizedError("Invalid or missing X-API-Key");
  }
  if (!bearer(request)) throw new UnauthorizedError("Invalid or missing X-API-Key");
  const staff = await requireStaff(request, ["manager"]);
  return { userId: staff.userId };
}

// ---------- customer tokens (Phase 5) ----------
function jwtKey(): Uint8Array {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}
export const JWT_EXPIRE_MINUTES = Number(process.env["JWT_EXPIRE_MINUTES"] || 120);

export async function createCustomerToken(customerId: number): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = JWT_EXPIRE_MINUTES * 60;
  const token = await new SignJWT({ role: "customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(customerId))
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(jwtKey());
  return { token, expiresIn };
}

export async function requireCustomer(request: Request): Promise<number> {
  const token = bearer(request);
  if (!token) throw new UnauthorizedError("Login required");
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { algorithms: ["HS256"] });
    if (payload.role !== "customer" || !payload.sub) throw new UnauthorizedError("Invalid token");
    return Number(payload.sub);
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    const expired = (error as { code?: string })?.code === "ERR_JWT_EXPIRED";
    throw new UnauthorizedError(expired ? "Session expired, please log in again" : "Invalid token");
  }
}
