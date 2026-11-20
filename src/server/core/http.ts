/** One consistent JSON error format (same as the SANAA model) + CORS helpers. */
import { ZodError, type ZodTypeAny, type z } from "zod";

export class AppError extends Error {
  status = 400;
  code = "bad_request";
  details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown> = {}, code?: string) {
    super(message);
    this.details = details;
    if (code) this.code = code;
  }
}
export class NotFoundError extends AppError { override status = 404; override code = "not_found"; }
export class UnauthorizedError extends AppError { override status = 401; override code = "unauthorized"; }
export class ForbiddenError extends AppError { override status = 403; override code = "forbidden"; }
export class ValidationFailedError extends AppError { override status = 422; override code = "validation_failed"; }
export class TooManyRequestsError extends AppError { override status = 429; override code = "too_many_requests"; }
export class ServiceUnavailableError extends AppError { override status = 503; override code = "service_unavailable"; }

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Session-ID, X-Request-ID",
  "Access-Control-Expose-Headers": "X-Request-ID",
  "Access-Control-Max-Age": "86400",
};

export function errorBody(code: string, message: string, requestId: string, details: unknown = {}) {
  return { success: false, error: { code, message, details: details ?? {}, request_id: requestId } };
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function toErrorResponse(error: unknown, requestId: string): Response {
  if (error instanceof AppError) {
    if (error.status >= 500) console.error(`${error.code}: ${error.message}`);
    return json(errorBody(error.code, error.message, requestId, error.details), error.status);
  }
  if (error instanceof ZodError) {
    const errors = error.issues.map((e) => ({ field: e.path.join("."), message: e.message }));
    return json(errorBody("validation_failed", "Invalid request", requestId, { errors }), 422);
  }
  console.error("Unhandled API error", error);
  return json(errorBody("internal_error", "Unexpected server error. Check the server logs.", requestId), 500);
}

export async function readJson<S extends ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationFailedError("Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Public origin of the request (for absolute file links). */
export function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
