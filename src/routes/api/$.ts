import { createFileRoute } from "@tanstack/react-router";
import { handleApi } from "@/server/api/router";

const handler = async ({ request, params }: { request: Request; params: { _splat?: string } }) => handleApi(request, params._splat ?? "");

/** The full REST API (same paths as the SANAA AI model). */
export const Route = createFileRoute("/api/$")({
  server: { handlers: { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler, OPTIONS: handler } },
});
