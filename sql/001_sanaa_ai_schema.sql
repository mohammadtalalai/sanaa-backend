-- SANAA AI: schema where the chatbot saves sessions, quotations and 3D designs.
-- Run once as a superuser / database owner:
--   psql -U postgres -d furniture_erp -v app_password="'a-strong-password'" -f sql/001_sanaa_ai_schema.sql
-- The analytics user (ai_readonly) stays read-only; the API writes only through ai_app.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_app') THEN
        CREATE ROLE ai_app LOGIN;
    END IF;
END $$;
ALTER ROLE ai_app PASSWORD :app_password;

CREATE SCHEMA IF NOT EXISTS sanaa_ai;

CREATE TABLE IF NOT EXISTS sanaa_ai.chat_sessions (
    session_id  text PRIMARY KEY,
    language    varchar(2)  NOT NULL DEFAULT 'ar',
    status      varchar(20) NOT NULL,
    state       jsonb       NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sanaa_ai.quotations (
    quotation_no    varchar(32) PRIMARY KEY,
    session_id      text REFERENCES sanaa_ai.chat_sessions(session_id),
    customer_name   text,
    customer_phone  varchar(20),
    language        varchar(2) NOT NULL DEFAULT 'ar',
    item            jsonb NOT NULL,
    pricing         jsonb NOT NULL,
    currency        varchar(3) NOT NULL DEFAULT 'EGP',
    total           numeric(14, 2) NOT NULL,
    valid_until     date NOT NULL,
    status          varchar(20) NOT NULL DEFAULT 'draft',   -- draft | accepted | expired
    design_id       varchar(40),
    created_at      timestamptz NOT NULL DEFAULT now(),
    accepted_at     timestamptz
);

CREATE TABLE IF NOT EXISTS sanaa_ai.designs (
    design_id        varchar(40) PRIMARY KEY,
    quotation_no     varchar(32) NOT NULL REFERENCES sanaa_ai.quotations(quotation_no),
    session_id       text REFERENCES sanaa_ai.chat_sessions(session_id),
    spec             jsonb NOT NULL,
    files            jsonb NOT NULL,
    dimension_check  jsonb NOT NULL,
    status           varchar(20) NOT NULL DEFAULT 'pending',   -- pending | approved | changes_requested
    feedback         text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    approved_at      timestamptz
);

CREATE INDEX IF NOT EXISTS quotations_phone_idx ON sanaa_ai.quotations (customer_phone);
CREATE INDEX IF NOT EXISTS designs_quotation_idx ON sanaa_ai.designs (quotation_no);

GRANT CONNECT ON DATABASE furniture_erp TO ai_app;
GRANT USAGE ON SCHEMA sanaa_ai TO ai_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA sanaa_ai TO ai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA sanaa_ai GRANT SELECT, INSERT, UPDATE ON TABLES TO ai_app;
-- ai_app needs no access to erp; give it the analytics views only if you want one user for everything:
-- GRANT USAGE ON SCHEMA analytics TO ai_app; GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO ai_app;
