# صنعة SANAA

Factory-management web app (Arabic / English) with the SANAA AI backend built in:
ERP screens, AI data assistant, voice questions, monthly recommendations, customer
quotation chatbot with 3D design, and customer order tracking.

## Run it

**On Lovable (nothing to install):** open the preview. The first account that signs up
becomes the factory admin/manager; later accounts are employees. Publish to get a public URL.

**Locally:**

```sh
bun install        # or npm i
bun run dev        # http://localhost:8080
bunx vitest run    # automated checks (pricing, parsing, SQL safety)
```

`.env` already contains the public backend URL/key. Server secrets (`LOVABLE_API_KEY`,
`JWT_SECRET`, optional `INTERNAL_API_KEY`) are managed in Lovable Cloud secrets.

## Pages

| Path | Who | What |
|---|---|---|
| `/dashboard` … `/settings` | staff (sign in) | ERP: sales, wizard, design studio, inventory, production, QC & delivery, finance, approvals, AI assistant, settings, audit |
| `/chat` | public | customer chatbot → quotation + 3D design |
| `/track` | public | customer order tracking (phone + order no.) |

## API (same contract as the SANAA model) — base `/api`

Auth: staff `Authorization: Bearer <access token from sign-in>`; internal endpoints also accept
`X-API-Key: <INTERNAL_API_KEY>`; customer endpoints use the token from `customer/auth/login`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health`, `/health/database`, `/health/views`, `/health/ollama` (`/health/ai`) | status |
| POST | `/internal/ask` | `{question, language?}` → SQL + report (manager) |
| POST | `/internal/sql/validate` | `{sql}` read-only analytics check |
| POST | `/internal/voice/transcribe` | multipart `audio` → text |
| POST | `/internal/voice/ask` | multipart `audio` → transcript + report |
| POST | `/internal/voice/speak` | `{text, language}` → `audio/wav` |
| POST | `/internal/recommendations` | `{language, use_llm, save}` monthly report |
| GET | `/internal/reports`, `/internal/reports/monthly/:id` | saved reports |
| POST/GET | `/customer/chat`, `/customer/chat/:session_id` | quotation chatbot |
| GET | `/customer/quotations/:no` | quotation |
| POST/GET | `/customer/designs`, `/customer/designs/:id`, `/:id/decision`, `/:id/files/:name` | 3D design (glb / svg / viewer / spec) |
| POST | `/customer/auth/login` | `{phone, order_no}` → customer token |
| GET | `/customer/orders`, `/customer/orders/:order_no` | tracking |

### Mobile / external app ERP REST — `/api/v1/:resource[/:id]`

`GET` (list, `?limit&offset&<filter>=`), `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`, acting as
the signed-in user (database permissions apply). Resources: orders, order-lines, payments,
customers, products, categories, branches, sales-reps, production, materials, suppliers,
purchase-orders, expenses, shipments, boms, quality-checks, approvals, notifications, shifts,
audit-log, settings, tenants, plans, feature-flags, announcements, quotations, designs.
`GET /api/v1/me` returns the user and roles. `/api/public/*` mirrors `/api/*` (same auth rules).

Sign a mobile app in with the backend auth (email/password or Google) and send the access token.

## Notes

- Demo data: ~18 months of orders up to reference date 2026‑11‑20 (November is partial).
- Catalogue prices in `src/shared/product_catalog.json` are illustrative — replace with real prices.
