from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.ai.llm import LLMError, OllamaClient, extract_json, llm
from app.ai.prompts import build_sql_prompt, sql_system_prompt
from app.core.config import settings

logger = logging.getLogger(__name__)
_SELECT_PATTERN = re.compile(r"((?:WITH|SELECT)\b.*?)(?:;|$)", re.IGNORECASE | re.DOTALL)


@dataclass
class SQLPlan:
    answerable: bool
    sql: str
    reason: str


def parse_plan(raw: str) -> SQLPlan:
    """Read the model answer; accept plain SQL if the JSON is broken."""
    try:
        data = extract_json(raw)
        sql = str(data.get("sql") or "").strip()
        answerable = bool(data.get("answerable", bool(sql)))
        return SQLPlan(answerable and bool(sql), sql, str(data.get("reason") or "").strip())
    except LLMError:
        match = _SELECT_PATTERN.search(raw.replace("```sql", "").replace("```", ""))
        if match:
            return SQLPlan(True, match.group(1).strip(), "")
        return SQLPlan(False, "", "The model did not return SQL")


class SQLGenerator:
    def __init__(self, client: OllamaClient | None = None):
        self.client = client or llm

    async def generate(self, question: str, knowledge: dict, reference_date: str | None,
                       previous_error: str | None = None, previous_sql: str | None = None) -> SQLPlan:
        messages = [
            {"role": "system", "content": sql_system_prompt(settings.max_sql_rows)},
            {"role": "user", "content": build_sql_prompt(question, knowledge["context"], knowledge["views"],
                                                         reference_date, previous_error, previous_sql)},
        ]
        raw = await self.client.chat(messages, json_mode=True, num_predict=600)
        plan = parse_plan(raw)
        logger.info("SQL plan | answerable=%s | reason=%s", plan.answerable, plan.reason)
        return plan
