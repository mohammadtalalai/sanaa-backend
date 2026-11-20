from __future__ import annotations

import copy
import datetime as dt
import json
import logging
from typing import Any, Protocol

from sqlalchemy import text

from app.core.config import settings
from app.core.database import app_session, to_jsonable

logger = logging.getLogger(__name__)


class Repository(Protocol):
    async def save_session(self, state: dict[str, Any]) -> None: ...
    async def get_session(self, session_id: str) -> dict[str, Any] | None: ...
    async def save_quotation(self, quotation: dict[str, Any]) -> None: ...
    async def get_quotation(self, quotation_no: str) -> dict[str, Any] | None: ...
    async def update_quotation(self, quotation_no: str, **fields: Any) -> None: ...
    async def save_design(self, design: dict[str, Any]) -> None: ...
    async def get_design(self, design_id: str) -> dict[str, Any] | None: ...
    async def update_design(self, design_id: str, **fields: Any) -> None: ...


class InMemoryRepository:
    """Used when DB_APP_PASSWORD is empty (development) and in tests. Data is lost on restart."""

    def __init__(self) -> None:
        self.sessions: dict[str, dict[str, Any]] = {}
        self.quotations: dict[str, dict[str, Any]] = {}
        self.designs: dict[str, dict[str, Any]] = {}

    async def save_session(self, state):
        self.sessions[state["session_id"]] = copy.deepcopy(state)

    async def get_session(self, session_id):
        return copy.deepcopy(self.sessions.get(session_id))

    async def save_quotation(self, quotation):
        self.quotations[quotation["quotation_no"]] = copy.deepcopy(quotation)

    async def get_quotation(self, quotation_no):
        return copy.deepcopy(self.quotations.get(quotation_no))

    async def update_quotation(self, quotation_no, **fields):
        if quotation_no in self.quotations:
            self.quotations[quotation_no].update(copy.deepcopy(fields))

    async def save_design(self, design):
        self.designs[design["design_id"]] = copy.deepcopy(design)

    async def get_design(self, design_id):
        return copy.deepcopy(self.designs.get(design_id))

    async def update_design(self, design_id, **fields):
        if design_id in self.designs:
            self.designs[design_id].update(copy.deepcopy(fields))


def _as_date(value: Any) -> dt.date | None:
    if value is None or isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value)[:10])


def _as_datetime(value: Any) -> dt.datetime | None:
    if value is None or isinstance(value, dt.datetime):
        return value
    return dt.datetime.fromisoformat(str(value))





QUOTATION_COLUMNS = ("quotation_no", "session_id", "customer_name", "customer_phone", "language", "item",
                     "pricing", "currency", "total", "valid_until", "status", "design_id", "created_at",
                     "accepted_at")
DESIGN_COLUMNS = ("design_id", "quotation_no", "session_id", "spec", "files", "dimension_check", "status",
                  "feedback", "created_at", "approved_at")
JSON_COLUMNS = {"item", "pricing", "spec", "files", "dimension_check"}
DATE_COLUMNS = {"valid_until"}
DATETIME_COLUMNS = {"created_at", "accepted_at", "approved_at"}


def _row(mapping) -> dict[str, Any]:
    row = {k: to_jsonable(v) for k, v in dict(mapping).items()}
    for column in JSON_COLUMNS & row.keys():
        if isinstance(row[column], str):
            row[column] = json.loads(row[column])
    return row


def _bind(row: dict[str, Any], columns: tuple[str, ...]) -> dict[str, Any]:
    params: dict[str, Any] = {}
    for column in columns:
        value = row.get(column)
        if column in JSON_COLUMNS:
            value = json.dumps(value, ensure_ascii=False, default=str) if value is not None else None
        elif column in DATE_COLUMNS:
            value = _as_date(value)
        elif column in DATETIME_COLUMNS:
            value = _as_datetime(value)
        params[column] = value
    return params


def _cast(column: str) -> str:
    return f"CAST(:{column} AS jsonb)" if column in JSON_COLUMNS else f":{column}"


class PostgresRepository:
    """Writes with the ai_app role into schema sanaa_ai (see sql/001_sanaa_ai_schema.sql)."""

    async def save_session(self, state):
        async with app_session() as conn:
            await conn.execute(text(
                "INSERT INTO sanaa_ai.chat_sessions (session_id, language, status, state, created_at, updated_at) "
                "VALUES (:sid, :lang, :status, CAST(:state AS jsonb), :created, :updated) "
                "ON CONFLICT (session_id) DO UPDATE SET language = EXCLUDED.language, status = EXCLUDED.status, "
                "state = EXCLUDED.state, updated_at = EXCLUDED.updated_at"),
                {"sid": state["session_id"], "lang": state["language"], "status": state["status"],
                 "state": json.dumps(state, ensure_ascii=False, default=str),
                 "created": _as_datetime(state["created_at"]), "updated": _as_datetime(state["updated_at"])})

    async def get_session(self, session_id):
        async with app_session() as conn:
            value = (await conn.execute(text("SELECT state FROM sanaa_ai.chat_sessions WHERE session_id = :sid"),
                                        {"sid": session_id})).scalar_one_or_none()
        return value if value is None or isinstance(value, dict) else json.loads(value)

    async def _insert(self, table: str, row: dict[str, Any], columns: tuple[str, ...], key: str):
        names = ", ".join(columns)
        values = ", ".join(_cast(c) for c in columns)
        updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in columns if c != key)
        async with app_session() as conn:
            await conn.execute(text(f"INSERT INTO sanaa_ai.{table} ({names}) VALUES ({values}) "
                                    f"ON CONFLICT ({key}) DO UPDATE SET {updates}"), _bind(row, columns))

    async def _get(self, table: str, key: str, value: str):
        async with app_session() as conn:
            row = (await conn.execute(text(f"SELECT * FROM sanaa_ai.{table} WHERE {key} = :v"),
                                      {"v": value})).mappings().one_or_none()
        return _row(row) if row else None

    async def _update(self, table: str, key: str, value: str, columns: tuple[str, ...], fields: dict[str, Any]):
        fields = {k: v for k, v in fields.items() if k in columns and k != key}
        if not fields:
            return
        assignments = ", ".join(f"{c} = {_cast(c)}" for c in fields)
        params = _bind(fields, tuple(fields))
        params["key_value"] = value
        async with app_session() as conn:
            await conn.execute(text(f"UPDATE sanaa_ai.{table} SET {assignments} WHERE {key} = :key_value"), params)

    async def save_quotation(self, quotation):
        await self._insert("quotations", quotation, QUOTATION_COLUMNS, "quotation_no")

    async def get_quotation(self, quotation_no):
        return await self._get("quotations", "quotation_no", quotation_no)

    async def update_quotation(self, quotation_no, **fields):
        await self._update("quotations", "quotation_no", quotation_no, QUOTATION_COLUMNS, fields)

    async def save_design(self, design):
        await self._insert("designs", design, DESIGN_COLUMNS, "design_id")

    async def get_design(self, design_id):
        return await self._get("designs", "design_id", design_id)

    async def update_design(self, design_id, **fields):
        await self._update("designs", "design_id", design_id, DESIGN_COLUMNS, fields)


_repository: Repository | None = None


def get_repository() -> Repository:
    global _repository
    if _repository is None:
        if settings.app_db_configured:
            _repository = PostgresRepository()
            logger.info("Customer data stored in PostgreSQL schema sanaa_ai")
        else:
            _repository = InMemoryRepository()
            logger.warning("DB_APP_PASSWORD is empty: chat sessions and quotations are kept in memory only")
    return _repository


def set_repository(repository: Repository | None) -> None:
    global _repository
    _repository = repository
