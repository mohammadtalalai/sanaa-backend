# SANAA AI

AI backend for a furniture manufacturer: management analytics (Text-to-SQL, reports, voice), ML recommendations,
a customer chatbot that produces quotations and 3D designs, and customer order tracking.
FastAPI + PostgreSQL (read-only `analytics` views) + a local LLM through Ollama.

## تشغيل سريع (بالعربي)

1. ثبّت Python 3.11 أو 3.12 و PostgreSQL و [Ollama](https://ollama.com/download).
2. `ollama pull qwen2.5:7b`
3. في فولدر المشروع:
   ```powershell
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   copy .env.example .env      # وبعدين اكتب DB_PASSWORD و JWT_SECRET
   uvicorn app.main:app --reload
   ```
4. افتح http://localhost:8000/docs

## 1. Phases

| Phase | What it does | Main code | Endpoints |
|---|---|---|---|
| 0 | Settings, logging, errors, PostgreSQL, view inspection, health | `app/core` | `GET /api/health`, `/api/health/database`, `/api/health/views`, `/api/health/ollama` |
| 1 | Question (AR/EN) -> knowledge (RAG) -> SQL -> validation -> execution -> report; voice in/out | `app/ai`, `app/internal_services/analysis`, `.../voice` | `POST /api/internal/ask`, `/sql/validate`, `/voice/transcribe`, `/voice/ask`, `/voice/speak` |
| 2 | History, feature engineering, forecasting (Ridge, kept only when its backtest beats a 3-month average; both compared with naive), product/branch/inventory/production recommendations, monthly report + scheduler | `app/internal_services/recommendations` | `POST /api/internal/recommendations` |
| 3 | Customer chatbot AR/EN: type, size, wood, finish, colour, quantity, city -> cost + delivery -> quotation saved in DB | `app/customer_services` | `POST /api/customer/chat`, `GET /api/customer/quotations/{no}` |
| 4 | Design spec -> 3D model (GLB) + preview PNG + web viewer, dimension check, approval linked to the quotation | `design_generator.py` | `POST /api/customer/designs`, `GET /designs/{id}`, `POST /designs/{id}/decision`, `GET /designs/{id}/files/{name}` |
| 5 | Customer login (customer id + order no), my orders, status, production progress & stage, payment, expected delivery, shipment, AR/EN message | `order_tracking.py` | `POST /api/customer/auth/login`, `GET /api/customer/orders`, `GET /api/customer/orders/{order_no}` |

## 2. Model choice (RTX 3060 Ti 8 GB VRAM, 16 GB RAM)

| Model | VRAM | Notes |
|---|---|---|
| **`qwen2.5:7b` (default)** | ~5.5 GB with 8K context | Good SQL + Arabic, fits with Whisper on the GPU |
| `qwen3:8b` | ~6.5 GB | Stronger, keep `OLLAMA_THINK=false` |
| `qwen2.5-coder:7b` | ~5.5 GB | Better SQL, weaker Arabic reports |
| `qwen2.5:3b` | ~2.5 GB | Fastest, lower quality |

`qwen3.5:9b` from the old config is too heavy for 8 GB with an 8K context and Whisper, and its thinking mode is slow.
Whisper: `small` by default; `medium` gives better Arabic and still fits (~1.5 GB).

## 3. Install

```powershell
python -m venv .venv
.venv\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
ollama pull qwen2.5:7b
copy .env.example .env          # Linux/macOS: cp .env.example .env
```
Edit `.env`: `DB_PASSWORD`, `JWT_SECRET` (`python -c "import secrets;print(secrets.token_urlsafe(48))"`),
`INTERNAL_API_KEY` (required in production).

## 4. Database roles

* `ai_readonly` (already exists) - SELECT on the `analytics` views only. The API also forces read-only transactions.
* `ai_app` - writes chatbot sessions, quotations and designs into the new schema `sanaa_ai`:
  ```powershell
  psql -U postgres -d furniture_erp -v app_password="'a-strong-password'" -f sql/001_sanaa_ai_schema.sql
  ```
  Then set `DB_APP_PASSWORD` in `.env`. If it stays empty, Phase 3/4 data is kept in memory (lost on restart).

## 5. Run

```powershell
uvicorn app.main:app --reload --port 8000
```
Docs: http://localhost:8000/docs

### Examples (PowerShell)

```powershell
# Phase 0
irm http://localhost:8000/api/health/database
irm http://localhost:8000/api/health/views
irm http://localhost:8000/api/health/ollama

# Phase 1
$h = @{ "X-API-Key" = "your-internal-key" }
irm -Method Post http://localhost:8000/api/internal/ask -Headers $h -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes('{"question": "ايه أكتر منتج بيحقق أرباح؟"}'))
curl.exe -X POST http://localhost:8000/api/internal/voice/ask -H "X-API-Key: your-internal-key" -F "audio=@question.mp3"

# Phase 2
irm -Method Post http://localhost:8000/api/internal/recommendations -Headers $h -ContentType "application/json" -Body '{"language":"ar"}'

# Phase 3-4: send messages with the same session_id until status = quoted, then reply "نعم" for the 3D design
irm -Method Post http://localhost:8000/api/customer/chat -ContentType "application/json; charset=utf-8" `
    -Body ([Text.Encoding]::UTF8.GetBytes('{"message": "عايز ترابيزة سفرة 200×100×75 خشب جوز"}'))

# Phase 5
$t = irm -Method Post http://localhost:8000/api/customer/auth/login -ContentType "application/json" -Body '{"customer_id": 1, "order_no": "SO-0001"}'
irm http://localhost:8000/api/customer/orders/SO-0001 -Headers @{ Authorization = "Bearer $($t.access_token)" }
```

## 6. Tests

```powershell
pytest -q                                   # 125 unit tests - no database or Ollama needed
$env:RUN_INTEGRATION="1"; pytest -m integration   # against your real database (.env)
```

| File | Covers |
|---|---|
| `test_sql_validator.py` | only documented analytics views, no writes/DDL/multi-statements/pg_* functions, LIMIT enforced, customer view blocked |
| `test_analysis.py` | language, domain detection for the 4 phase questions, retries with error feedback, reports, partial-month/factory notes |
| `test_recommendations.py` | features, forecasting vs naive, recommendations checked against history, monthly report |
| `test_customer.py` | parsing AR/EN, exact price calculation, full chat to a saved quotation |
| `test_design.py` | 3D model dimensions = requested for every product type and size, GLB round-trip, approval |
| `test_tracking.py` | login needs customer + order, AR/EN status, payment, late delivery, no access to other customers' orders |
| `test_api.py` | HTTP layer, API key, sessions, rate limit, error format |
| `test_database.py` | integration: read-only connection, all views readable with documented columns |

## 7. Folder structure

```
SANAA/
├── app/
│   ├── main.py
│   ├── core/            config, logger, exceptions, database, security
│   ├── ai/              llm (Ollama), language, rag, embeddings, prompts
│   ├── prompts/         analysis / report / recommendation / customer prompts
│   ├── api/             health, internal, customer routes + schemas
│   ├── internal_services/
│   │   ├── analysis/          sql_generator, sql_validator, sql_executor, report_generator, analyzer
│   │   ├── voice/             speech_to_text (faster-whisper), text_to_speech (edge-tts)
│   │   └── recommendations/   data_analyzer, feature_engineering, forecasting, recommender, monthly_report, models
│   └── customer_services/     chatbot, question_workflow, conversation, costing, quotation,
│                              repository, design_generator, order_tracking
├── knowledge_base/      schema + business rules (.md) and product_catalog.json
├── sql/                 001_sanaa_ai_schema.sql
├── tests/
├── ml_models/  reports/  logs/  generated_designs/   (created at runtime)
├── requirements.txt  pytest.ini  .env.example
```

## 8. Important notes

* **Prices are placeholders.** Replace `knowledge_base/product_catalog.json` (base prices, wood/finish multipliers,
  colour extras, delivery zones, production days) with the real SANAA price list.
* Customer login uses customer number + order number. Before a public launch add an OTP to the customer's phone.
* `edge-tts` needs internet. Whisper downloads its model on first use.
* Make sure Ollama runs on the GPU (`ollama ps` shows `100% GPU`). On CPU only, a 7B model needs minutes per answer.
* Comparisons with the current month are computed in Python (exact % change + full-month estimate at the current pace) and shown in `report.notes`, so they never depend on the model doing arithmetic.
* The analyst never sees `analytics.v_order_tracking`; only Phase 5 reads it, always filtered by order_no **and** customer_id.
* Dates like "this month" use `analytics.v_as_of`, not the computer date. The current month is flagged as partial.

## 9. What was fixed from the previous version

| Problem in the old code | Fix |
|---|---|
| The analysis endpoint ended up at `/api/internal/internal/ask` (prefix added twice) | `/api/internal/ask` |
| `AskResponse` required fields the analyzer never returned, so requests failed | The schema matches the real result |
| `llm.py` read `os.getenv` directly (ignored `.env`) and didn't send `num_ctx`, so Ollama truncated the prompt | Everything comes from `settings`, plus `num_ctx`, `keep_alive` and JSON mode |
| `psycopg` async doesn't work with the default Windows event loop | Switched to `asyncpg` |
| The validator rejected `WITH` (CTE) queries and allowed `v_order_tracking` | CTEs allowed, sensitive view blocked, `FOR UPDATE`/`SELECT INTO`/`pg_*` blocked |
| `test_sql_validator.py` imported a function that didn't exist; the other tests were empty | 125 real tests |
| `security.py` accepted any key; logging was never configured | Real key check + logs to `logs/sanaa.log` with a request id |
| A real password was in `.env.example` | Replaced with `CHANGE_ME` - **change the `ai_readonly` password in PostgreSQL** |
| Duplicate prompts (`analysis/prompts.py` and `ai/prompts.py`) | One source: `app/prompts/*.txt` |
