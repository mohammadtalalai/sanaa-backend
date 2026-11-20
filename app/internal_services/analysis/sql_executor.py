from __future__ import annotations

import time
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, SQLAlchemyError

from app.core.database import get_db, to_jsonable


class SQLExecutionError(RuntimeError):
    pass


async def execute_readonly_query(sql: str, max_rows: int) -> dict[str, Any]:
    start = time.perf_counter()
    try:
        async with get_db() as conn:
            result = await conn.execute(text(sql))
            columns = list(result.keys())
            raw_rows = result.fetchmany(max_rows + 1)
            await conn.rollback()
    except DBAPIError as exc:
        message = str(getattr(exc, "orig", exc)).strip().splitlines()[0]
        raise SQLExecutionError(message) from exc
    except SQLAlchemyError as exc:
        raise SQLExecutionError(str(exc).splitlines()[0]) from exc
    rows = [{c: to_jsonable(v) for c, v in zip(columns, row)} for row in raw_rows[:max_rows]]
    return {"columns": columns, "rows": rows, "row_count": len(rows), "truncated": len(raw_rows) > max_rows,
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 1)}
