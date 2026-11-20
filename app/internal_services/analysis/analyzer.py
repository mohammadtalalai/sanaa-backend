from __future__ import annotations

import logging
import time
from typing import Any

from app.ai.language import detect_language
from app.ai.llm import LLMError
from app.ai.rag import KnowledgeRetriever, retriever
from app.core.config import settings
from app.core.database import get_reference_date
from app.core.exceptions import ServiceUnavailableError, ValidationFailedError
from app.internal_services.analysis.report_generator import ReportGenerator
from app.internal_services.analysis.sql_executor import SQLExecutionError, execute_readonly_query
from app.internal_services.analysis.sql_generator import SQLGenerator
from app.internal_services.analysis.sql_validator import SQLValidator

logger = logging.getLogger(__name__)

NOT_ANSWERABLE = {
    "ar": "لا أستطيع الإجابة على هذا السؤال من البيانات المتاحة. ",
    "en": "I can't answer this question from the available data. ",
}
FAILED = {
    "ar": "لم أتمكن من بناء استعلام صحيح لهذا السؤال. جرّب صياغة أوضح.",
    "en": "I could not build a valid query for this question. Try rephrasing it.",
}


class Analyzer:
    def __init__(self, generator: SQLGenerator | None = None, reporter: ReportGenerator | None = None,
                 knowledge: KnowledgeRetriever | None = None, validator: SQLValidator | None = None,
                 executor=execute_readonly_query, reference_date_provider=get_reference_date):
        self.generator = generator or SQLGenerator()
        self.reporter = reporter or ReportGenerator()
        self.knowledge = knowledge or retriever
        self.validator = validator or SQLValidator()
        self.executor = executor
        self.reference_date_provider = reference_date_provider

    async def ask(self, question: str, language: str | None = None) -> dict[str, Any]:
        question = (question or "").strip()
        if not question:
            raise ValidationFailedError("The question is empty")
        if len(question) > settings.max_question_length:
            raise ValidationFailedError(f"The question is longer than {settings.max_question_length} characters")
        language = language if language in ("ar", "en") else detect_language(question)
        start = time.perf_counter()

        knowledge = await self.knowledge.retrieve(question)
        reference_date = (await self.reference_date_provider()).isoformat()
        result: dict[str, Any] = {
            "question": question, "language": language, "domain": knowledge["domain"],
            "domains": knowledge["domains"], "reference_date": reference_date, "sql": None, "reason": "",
            "rows": [], "row_count": 0, "truncated": False, "attempts": 0, "errors": [],
        }

        previous_error = previous_sql = None
        execution = None
        try:
            for attempt in range(1, settings.max_sql_attempts + 1):
                result["attempts"] = attempt
                plan = await self.generator.generate(question, knowledge, reference_date, previous_error, previous_sql)
                result["reason"] = plan.reason
                if not plan.answerable:
                    result["report"] = self._message(NOT_ANSWERABLE[language] + plan.reason)
                    return self._finish(result, start)
                check = self.validator.validate(plan.sql)
                if not check.valid:
                    previous_error, previous_sql = check.error, plan.sql
                    result["errors"].append(f"validation: {check.error}")
                    logger.info("SQL attempt %s rejected: %s", attempt, check.error)
                    continue
                try:
                    execution = await self.executor(check.sql, settings.max_sql_rows)
                    result["sql"] = check.sql
                    break
                except SQLExecutionError as exc:
                    previous_error, previous_sql = str(exc), check.sql
                    result["errors"].append(f"database: {exc}")
                    logger.info("SQL attempt %s failed in database: %s", attempt, exc)
        except LLMError as exc:
            raise ServiceUnavailableError(f"The AI model is not available: {exc}") from exc

        if execution is None:
            result["report"] = self._message(FAILED[language])
            return self._finish(result, start)

        result.update(rows=execution["rows"], row_count=execution["row_count"], truncated=execution["truncated"])
        result["report"] = await self.reporter.generate(question, result["sql"], execution["rows"], language,
                                                        reference_date, execution["truncated"])
        return self._finish(result, start)

    @staticmethod
    def _message(text: str) -> dict[str, Any]:
        return {"answer": text, "highlights": [], "recommendations": [], "statistics": {}, "columns": [], "notes": [], "comparison": None}

    @staticmethod
    def _finish(result: dict[str, Any], start: float) -> dict[str, Any]:
        result["elapsed_ms"] = round((time.perf_counter() - start) * 1000, 1)
        logger.info("Analysis done | domains=%s | rows=%s | %.0f ms", result["domains"], result["row_count"],
                    result["elapsed_ms"])
        return result


analyzer = Analyzer()
