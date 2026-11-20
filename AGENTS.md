<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- SANAA AI (original FastAPI/Python) is ported to TypeScript under `src/server/` and `src/shared/`; keep its `/api/*` endpoint contract unchanged because external/mobile clients depend on it.
- All HTTP API goes through the single splat router `src/server/api/router.ts` (+ `v1.ts` for ERP REST) mounted at `src/routes/api/$.ts`; add endpoints there, not as new route files, so auth and error shape stay uniform.
- Staff UI lives in `src/fos/` and reads/writes data only through `src/fos/lib/cloud.ts`, so screens never talk to tables directly.
- Pricing, parsing and 3D generation live in `src/shared/` (browser-safe, used by server and UI) so quotes match everywhere.
- AI analysis may only run validated SELECTs over the approved analytics views via the read-only RPC; never widen the validator allow-list to ERP tables.
- Browser-only libraries (e.g. the 3D model viewer) are loaded at runtime from their CDN, not bundled, because bundled chunks get evaluated during server rendering and crash every page.
- The AI server is chosen by env in `src/server/ai/gateway.ts`: Lovable AI Gateway by default, any OpenAI-compatible server (Ollama/OpenAI) only when `AI_BASE_URL` is set, so the downloaded app can run fully offline without changing the hosted behaviour.
- `vite.config.ts` copies `.env`/`.env.local` into `process.env` for local runs outside Lovable, because server code reads its keys from `process.env`; keep the downloadable copy's local-run steps in `docs/LOCAL-SETUP-AR.md`.
