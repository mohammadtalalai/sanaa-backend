import { createFileRoute } from "@tanstack/react-router";
import { handleApi } from "@/server/api/router";

const handler = async ({ request, params }: { request: Request; params: { _splat?: string } }) => handleApi(request, params._splat ?? "");

/** Same API under /api/public/* for outside apps (mobile, integrations). Each endpoint still checks its caller. */
export const Route = createFileRoute("/api/public/$")({
  server: { handlers: { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler, OPTIONS: handler } },
});
