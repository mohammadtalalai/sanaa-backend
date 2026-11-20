/**
 * Static safety checks for model-generated SQL (port of sql_validator.py).
 * Second layer: the database runs the query as the read-only `ai_readonly` role in a read-only transaction.
 */
export const EXPECTED_VIEWS: Record<string, string[]> = {
  v_as_of: ["as_of"],
  v_sales_lines: ["line_id", "order_id", "order_no", "sale_date", "sale_month", "branch_id", "branch_name_en", "branch_name_ar",
    "order_type", "channel", "order_status", "delivery_city", "product_id", "sku", "product_name_en", "product_name_ar",
    "category_code", "category_name_en", "category_name_ar", "wood_en", "wood_ar", "finish_en", "finish_ar", "width_cm",
    "depth_cm", "height_cm", "quantity", "net_revenue", "cogs", "gross_profit"],
  v_orders: ["order_id", "order_no", "customer_id", "branch_id", "branch_name_en", "branch_name_ar", "sales_rep_id",
    "sales_rep_en", "sales_rep_ar", "order_type", "channel", "status", "created_at", "confirmed_at", "sale_month",
    "promised_date", "delivered_at", "is_sale", "subtotal", "discount_amount", "discount_pct", "net_amount", "vat_amount",
    "total_amount", "delivered_late", "days_to_deliver", "delivery_city", "cancel_reason"],
  v_monthly_sales: ["sale_month", "branch_id", "branch_name_en", "branch_name_ar", "orders", "units", "net_revenue", "cogs",
    "gross_profit", "gross_margin_pct"],
  v_product_performance: ["product_id", "sku", "product_name_en", "product_name_ar", "category_code", "category_name_en",
    "category_name_ar", "units", "orders", "net_revenue", "cogs", "gross_profit", "gross_margin_pct", "first_sale", "last_sale"],
  v_branch_monthly_pnl: ["month_start", "branch_id", "branch_code", "branch_name_en", "branch_name_ar", "branch_type", "revenue",
    "cogs", "delivery_cost", "gross_profit", "operating_expenses", "net_profit"],
  v_company_monthly_pnl: ["month_start", "revenue", "cogs", "delivery_cost", "gross_profit", "operating_expenses", "net_profit",
    "net_margin_pct"],
  v_order_tracking: ["order_id", "order_no", "customer_id", "branch_id", "status", "status_label_ar", "status_label_en",
    "status_seq", "created_at", "confirmed_at", "promised_date", "delivered_at", "last_update_at", "total_steps",
    "completed_steps", "total_amount", "paid_amount", "balance_due"],
  v_inventory_status: ["material_id", "sku", "name_en", "name_ar", "material_type", "unit", "stock_qty", "reorder_level",
    "stock_value", "stock_status", "supplier_name_en", "supplier_name_ar", "lead_time_days"],
  v_production_status: ["production_order_id", "po_no", "order_no", "sales_branch_id", "sku", "product_name_en",
    "product_name_ar", "status", "quantity", "planned_start", "planned_end", "actual_start", "actual_end", "total_steps",
    "completed_steps", "current_stage_en", "is_late", "material_cost", "labor_cost", "standard_cost"],
  v_customer_summary: ["customer_id", "city", "city_ar", "customer_type", "source", "preferred_language", "created_at",
    "orders_count", "lifetime_net_revenue", "first_order_at", "last_order_at"],
  v_supplier_monthly: ["month_start", "supplier_id", "name_en", "name_ar", "purchase_orders", "total_spend", "avg_delay_days",
    "late_deliveries"],
};

export const ALLOWED_SCHEMA = "analytics";
export const SENSITIVE_VIEWS = new Set(["v_order_tracking"]);
export const INTERNAL_VIEWS = Object.keys(EXPECTED_VIEWS).filter((v) => !SENSITIVE_VIEWS.has(v));

const FORBIDDEN_WORDS = new Set(["insert", "update", "delete", "merge", "create", "drop", "alter", "truncate", "grant",
  "revoke", "copy", "vacuum", "call", "do", "execute", "prepare", "deallocate", "listen", "notify", "unlisten", "set",
  "reset", "begin", "commit", "rollback", "savepoint", "lock", "into", "returning", "reindex", "cluster", "discard",
  "import", "load", "security", "refresh"]);
const FORBIDDEN_FUNCTIONS = new Set(["dblink", "dblink_exec", "lo_import", "lo_export", "set_config", "query_to_xml",
  "copy", "current_user_password", "current_setting", "txid_current", "version"]);
const BLOCKED_SCHEMAS = new Set(["erp", "public", "pg_catalog", "information_schema", "auth", "storage", "vault",
  "extensions", "cron", "net", "realtime", "supabase_functions", "graphql", "graphql_public", "pgsodium"]);
const SAFE_FROM_FUNCTIONS = new Set(["generate_series", "unnest"]);
const FROM_IN_FUNCTION = new Set(["extract", "substring", "trim", "overlay", "position"]);
const NOT_ALIASES = new Set(["where", "join", "inner", "left", "right", "full", "outer", "cross", "natural", "on", "using",
  "group", "order", "limit", "offset", "having", "window", "union", "intersect", "except", "fetch", "for", "lateral", "as",
  "select", "from", "and", "or", "not", "tablesample"]);

type Token = { type: "word" | "qident" | "string" | "number" | "punct" | "op"; value: string; lower: string; start: number; end: number };

export type ValidationResult = { valid: boolean; sql: string; error: string; tables: string[] };

class SQLValidationError extends Error {}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: Token["type"], start: number, end: number, value = sql.slice(start, end)) =>
    tokens.push({ type, value, lower: value.toLowerCase(), start, end });
  while (i < sql.length) {
    const ch = sql[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "-" && sql[i + 1] === "-") { while (i < sql.length && sql[i] !== "\n") i++; continue; }
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) throw new SQLValidationError("SQL syntax error: unterminated comment");
      i = end + 2; continue;
    }
    if (ch === "'" || ((ch === "E" || ch === "e") && sql[i + 1] === "'")) {
      const start = i;
      i += ch === "'" ? 1 : 2;
      while (i < sql.length) {
        if (sql[i] === "\\" && ch !== "'") { i += 2; continue; }
        if (sql[i] === "'") { if (sql[i + 1] === "'") { i += 2; continue; } break; }
        i++;
      }
      if (i >= sql.length) throw new SQLValidationError("SQL syntax error: unterminated string");
      i++;
      push("string", start, i);
      continue;
    }
    if (ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        if (end < 0) throw new SQLValidationError("SQL syntax error: unterminated string");
        push("string", i, end + tag[0].length);
        i = end + tag[0].length;
        continue;
      }
    }
    if (ch === '"') {
      const start = i;
      i++;
      while (i < sql.length && !(sql[i] === '"' && sql[i + 1] !== '"')) i += sql[i] === '"' ? 2 : 1;
      if (i >= sql.length) throw new SQLValidationError("SQL syntax error: unterminated identifier");
      i++;
      const inner = sql.slice(start + 1, i - 1).replace(/""/g, '"');
      tokens.push({ type: "qident", value: inner, lower: inner.toLowerCase(), start, end: i });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      const m = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?/i.exec(sql.slice(i))!;
      push("number", i, i + m[0].length);
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_\u0080-\uFFFF]/.test(ch)) {
      const m = /^[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_$\u0080-\uFFFF]*/.exec(sql.slice(i))!;
      push("word", i, i + m[0].length);
      i += m[0].length;
      continue;
    }
    if ("(),;.[]".includes(ch)) { push("punct", i, i + 1); i++; continue; }
    const m = /^(::|<=|>=|<>|!=|\|\||->>|->|#>>|#>|[+\-*/%^<>=~!@#&|?:])/.exec(sql.slice(i));
    if (m) { push("op", i, i + m[0].length); i += m[0].length; continue; }
    throw new SQLValidationError(`SQL syntax error near '${sql.slice(i, i + 10)}'`);
  }
  return tokens;
}

const isIdent = (t: Token | undefined) => !!t && (t.type === "word" || t.type === "qident");
const isP = (t: Token | undefined, v: string) => !!t && t.type === "punct" && t.value === v;

function matchingParen(tokens: Token[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (isP(tokens[i], "(")) depth++;
    else if (isP(tokens[i], ")")) { depth--; if (depth === 0) return i; }
  }
  throw new SQLValidationError("SQL syntax error: unbalanced parentheses");
}

export class SQLValidator {
  readonly allowed: Set<string>;
  readonly maxRows: number;
  constructor(allowedViews: string[] = INTERNAL_VIEWS, maxRows = 100) {
    this.allowed = new Set(allowedViews.map((v) => v.toLowerCase()));
    this.maxRows = maxRows;
  }

  validate(sql: string): ValidationResult {
    try {
      const [clean, tables] = this.check(sql);
      return { valid: true, sql: clean, error: "", tables };
    } catch (error) {
      if (error instanceof SQLValidationError) return { valid: false, sql: "", error: error.message, tables: [] };
      throw error;
    }
  }

  private check(sql: string): [string, string[]] {
    let cleaned = (sql ?? "").trim();
    while (cleaned.endsWith(";")) cleaned = cleaned.slice(0, -1).trim();
    if (!cleaned) throw new SQLValidationError("Empty SQL");
    const tokens = tokenize(cleaned);
    if (!tokens.length) throw new SQLValidationError("Empty SQL");
    if (tokens.some((t) => isP(t, ";"))) throw new SQLValidationError("Only one SQL statement is allowed");
    const first = tokens.find((t) => !isP(t, "("));
    if (!first || first.type !== "word" || !["select", "with", "values"].includes(first.lower) || first.lower === "values") {
      throw new SQLValidationError("Only SELECT queries are allowed");
    }

    // parentheses balance + context (functions whose arguments use FROM)
    let depth = 0;
    const context: boolean[] = [];
    const fromIsKeyword: boolean[] = new Array(tokens.length).fill(true);
    tokens.forEach((t, i) => {
      if (isP(t, "(")) {
        const prev = tokens[i - 1];
        context.push(!!prev && prev.type === "word" && FROM_IN_FUNCTION.has(prev.lower));
        depth++;
      } else if (isP(t, ")")) {
        depth--;
        context.pop();
        if (depth < 0) throw new SQLValidationError("SQL syntax error: unbalanced parentheses");
      } else if (t.type === "word" && t.lower === "from") {
        if (context[context.length - 1]) fromIsKeyword[i] = false;
        const p1 = tokens[i - 1], p2 = tokens[i - 2];
        if (p1?.lower === "distinct" && p2?.lower === "is") fromIsKeyword[i] = false;
      }
    });
    if (depth !== 0) throw new SQLValidationError("SQL syntax error: unbalanced parentheses");

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.type !== "word") continue;
      if (t.lower === "for" && ["update", "share", "no", "key"].includes(tokens[i + 1]?.lower ?? "")) {
        throw new SQLValidationError("Row locking (FOR UPDATE/SHARE) is not allowed");
      }
      if (t.lower === "into") throw new SQLValidationError("SELECT INTO is not allowed");
      if (FORBIDDEN_WORDS.has(t.lower) && !isP(tokens[i - 1], ".")) {
        throw new SQLValidationError(`Forbidden statement: ${t.value.toUpperCase()}`);
      }
    }

    // functions + schema-qualified names anywhere
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (!isIdent(t)) continue;
      if (isP(tokens[i + 1], ".") && isIdent(tokens[i + 2])) {
        if (BLOCKED_SCHEMAS.has(t.lower) || t.lower.startsWith("pg_")) {
          throw new SQLValidationError(`Table '${t.value}.${tokens[i + 2]!.value}' must be one of the analytics views (analytics.view_name)`);
        }
      }
      if (isP(tokens[i + 1], "(") && t.type === "word") {
        const name = t.lower;
        if (name.startsWith("pg_") || FORBIDDEN_FUNCTIONS.has(name)) throw new SQLValidationError(`Function '${name}' is not allowed`);
      }
    }

    // CTE names
    const cteNames = new Set<string>();
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]!.type !== "word" || tokens[i]!.lower !== "with") continue;
      let j = i + 1;
      if (tokens[j]?.lower === "recursive") j++;
      while (isIdent(tokens[j])) {
        cteNames.add(tokens[j]!.lower);
        j++;
        if (isP(tokens[j], "(")) j = matchingParen(tokens, j) + 1;
        if (tokens[j]?.lower !== "as") break;
        j++;
        if (tokens[j]?.lower === "not") j++;
        if (tokens[j]?.lower === "materialized") j++;
        if (!isP(tokens[j], "(")) break;
        j = matchingParen(tokens, j) + 1;
        if (!isP(tokens[j], ",")) break;
        j++;
      }
    }

    // table references after FROM / JOIN
    const tables: string[] = [];
    const checkTableAt = (start: number): number => {
      let j = start;
      if (tokens[j]?.lower === "lateral") j++;
      if (tokens[j]?.lower === "only") j++;
      if (isP(tokens[j], "(")) return matchingParen(tokens, j) + 1; // subquery (checked on its own)
      if (!isIdent(tokens[j])) throw new SQLValidationError("SQL syntax error: table name expected");
      const parts = [tokens[j]!];
      while (isP(tokens[j + 1], ".") && isIdent(tokens[j + 2])) { parts.push(tokens[j + 2]!); j += 2; }
      j++;
      if (parts.length > 2) throw new SQLValidationError("Cross-database references are not allowed");
      if (isP(tokens[j], "(")) {
        const fn = parts.map((p) => p.lower).join(".");
        if (parts.length > 1 || !SAFE_FROM_FUNCTIONS.has(fn)) throw new SQLValidationError(`Function '${fn}' is not allowed in FROM`);
        j = matchingParen(tokens, j) + 1;
      } else if (parts.length === 1) {
        const name = parts[0]!.lower;
        if (!cteNames.has(name)) {
          throw new SQLValidationError(`Table '${parts[0]!.value}' must be one of the analytics views (analytics.view_name)`);
        }
      } else {
        const [schema, view] = [parts[0]!.lower, parts[1]!.lower];
        if (schema !== ALLOWED_SCHEMA) {
          throw new SQLValidationError(`Table '${parts[0]!.value}.${parts[1]!.value}' must be one of the analytics views (analytics.view_name)`);
        }
        if (SENSITIVE_VIEWS.has(view)) throw new SQLValidationError(`analytics.${view} contains customer data and is not available for analysis`);
        if (!this.allowed.has(view)) throw new SQLValidationError(`Unknown or not allowed view: analytics.${view}`);
        if (!tables.includes(`analytics.${view}`)) tables.push(`analytics.${view}`);
      }
      // optional alias + column alias list
      if (tokens[j]?.lower === "as") j++;
      if (isIdent(tokens[j]) && !NOT_ALIASES.has(tokens[j]!.lower)) {
        j++;
        if (isP(tokens[j], "(")) j = matchingParen(tokens, j) + 1;
      }
      return j;
    };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (t.type !== "word") continue;
      if ((t.lower === "from" && fromIsKeyword[i]) || t.lower === "join") {
        let j = checkTableAt(i + 1);
        while (isP(tokens[j], ",")) j = checkTableAt(j + 1);
      }
    }
    if (!tables.length) throw new SQLValidationError("The query must read from at least one analytics view");

    return [this.enforceLimit(cleaned, tokens), tables];
  }

  private enforceLimit(sql: string, tokens: Token[]): string {
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!;
      if (isP(t, "(")) depth++;
      else if (isP(t, ")")) depth--;
      else if (depth === 0 && t.type === "word" && t.lower === "limit") {
        const next = tokens[i + 1];
        if (next?.type === "number") {
          const value = Number(next.value);
          if (!(value <= this.maxRows)) return sql.slice(0, next.start) + String(this.maxRows) + sql.slice(next.end);
          return sql;
        }
        if (next?.lower === "all") return sql.slice(0, next.start) + String(this.maxRows) + sql.slice(next.end);
        throw new SQLValidationError("LIMIT must be a number");
      } else if (depth === 0 && t.type === "word" && t.lower === "fetch") {
        return sql;
      }
    }
    return `${sql} LIMIT ${this.maxRows}`;
  }
}

export function validateReadonlySql(sql: string, maxRows = 100): ValidationResult {
  return new SQLValidator(INTERNAL_VIEWS, maxRows).validate(sql);
}
