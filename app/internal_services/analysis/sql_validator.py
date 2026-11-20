from __future__ import annotations

from dataclasses import dataclass, field

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

from app.core.config import settings
from app.core.database import EXPECTED_VIEWS

ALLOWED_SCHEMA = "analytics"
# Customer-sensitive view: only the order-tracking service (Phase 5) may read it, never the analyst.
SENSITIVE_VIEWS = {"v_order_tracking"}
INTERNAL_VIEWS = frozenset(set(EXPECTED_VIEWS) - SENSITIVE_VIEWS)

_FORBIDDEN_NODE_NAMES = ("Insert", "Update", "Delete", "Merge", "Create", "Drop", "Alter", "Command",
                         "TruncateTable", "Grant", "Copy", "Set", "Use", "Transaction", "Commit", "Rollback")
FORBIDDEN_NODES = tuple(getattr(exp, name) for name in _FORBIDDEN_NODE_NAMES if hasattr(exp, name))
FORBIDDEN_FUNCTIONS = {"dblink", "dblink_exec", "lo_import", "lo_export", "set_config", "query_to_xml",
                       "copy", "current_user_password"}


@dataclass
class ValidationResult:
    valid: bool
    sql: str = ""
    error: str = ""
    tables: list[str] = field(default_factory=list)


class SQLValidationError(ValueError):
    pass


class SQLValidator:
    def __init__(self, allowed_views: frozenset[str] | set[str] = INTERNAL_VIEWS, max_rows: int | None = None):
        self.allowed_views = {v.lower() for v in allowed_views}
        self.max_rows = max_rows or settings.max_sql_rows

    def validate(self, sql: str) -> ValidationResult:
        try:
            return ValidationResult(True, *self._check(sql))
        except SQLValidationError as exc:
            return ValidationResult(False, error=str(exc))

    def _check(self, sql: str) -> tuple[str, str, list[str]]:
        cleaned = (sql or "").strip().rstrip(";").strip()
        if not cleaned:
            raise SQLValidationError("Empty SQL")
        try:
            statements = [s for s in sqlglot.parse(cleaned, read="postgres") if s is not None]
        except ParseError as exc:
            raise SQLValidationError(f"SQL syntax error: {str(exc).splitlines()[0]}") from exc
        if len(statements) != 1:
            raise SQLValidationError("Only one SQL statement is allowed")
        tree = statements[0]
        if not isinstance(tree, (exp.Select, exp.Union, exp.Intersect, exp.Except)):
            raise SQLValidationError("Only SELECT queries are allowed")
        for node in tree.walk():
            if isinstance(node, FORBIDDEN_NODES):
                raise SQLValidationError(f"Forbidden statement: {type(node).__name__.upper()}")
        for select in tree.find_all(exp.Select):
            if select.args.get("into") is not None:
                raise SQLValidationError("SELECT INTO is not allowed")
            if select.args.get("locks"):
                raise SQLValidationError("Row locking (FOR UPDATE/SHARE) is not allowed")

        cte_names = {cte.alias_or_name.lower() for cte in tree.find_all(exp.CTE)}
        tables: list[str] = []
        for table in tree.find_all(exp.Table):
            name = (table.name or "").lower()
            schema = (table.db or "").lower()
            if not schema and name in cte_names:
                continue
            if table.args.get("catalog"):
                raise SQLValidationError("Cross-database references are not allowed")
            if schema != ALLOWED_SCHEMA:
                raise SQLValidationError(f"Table '{table.sql()}' must be one of the analytics views (analytics.view_name)")
            if name in SENSITIVE_VIEWS:
                raise SQLValidationError(f"analytics.{name} contains customer data and is not available for analysis")
            if name not in self.allowed_views:
                raise SQLValidationError(f"Unknown or not allowed view: analytics.{name}")
            if f"analytics.{name}" not in tables:
                tables.append(f"analytics.{name}")
        if not tables:
            raise SQLValidationError("The query must read from at least one analytics view")

        for func in tree.find_all(exp.Func):
            fname = (func.name if isinstance(func, exp.Anonymous) else func.sql_name()).lower()
            if fname.startswith("pg_") or fname in FORBIDDEN_FUNCTIONS:
                raise SQLValidationError(f"Function '{fname}' is not allowed")

        tree = self._enforce_limit(tree)
        return tree.sql(dialect="postgres"), "", tables

    def _enforce_limit(self, tree: exp.Expression) -> exp.Expression:
        limit = tree.args.get("limit")
        if limit is None:
            return tree.limit(self.max_rows)
        value = limit.expression if isinstance(limit, exp.Limit) else None
        try:
            if value is not None and int(value.name) <= self.max_rows:
                return tree
        except (TypeError, ValueError):
            pass
        return tree.limit(self.max_rows)


def validate_readonly_sql(sql: str, max_rows: int | None = None) -> ValidationResult:
    return SQLValidator(max_rows=max_rows).validate(sql)
