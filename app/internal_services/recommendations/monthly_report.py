from __future__ import annotations

import datetime as dt
import json
import logging
from pathlib import Path
from typing import Any

from app.ai.llm import LLMError, OllamaClient, llm
from app.ai.prompts import build_recommendation_prompt, recommendation_system_prompt
from app.core.config import settings
from app.internal_services.recommendations.data_analyzer import HistoricalDataLoader
from app.internal_services.recommendations.models import RecommendationReport, to_native
from app.internal_services.recommendations.recommender import Recommender

logger = logging.getLogger(__name__)


def _fmt(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:,.2f}"
    return str(value)


def to_markdown(report: dict[str, Any]) -> str:
    lines = [f"# SANAA monthly report - {report['last_complete_month']}",
             f"_Data as of {report['reference_date']} - generated {report['generated_at']}_", ""]
    if report.get("summary"):
        lines += ["## Summary", report["summary"], ""]
    if report.get("priorities"):
        lines += ["## Priorities", *[f"{i}. {p}" for i, p in enumerate(report["priorities"], 1)], ""]
    lines += ["## Findings", *[f"- **{f['title']}** {f['detail']}" for f in report["findings"]], ""]
    lines += ["## Recommendations",
              *[f"- [P{r['priority']}] **{r['action']}** - {r['reason']}" for r in report["recommendations"]], ""]
    lines += ["## Forecasts", "| target | model | next months | model MAE | naive MAE |", "|---|---|---|---|---|"]
    for f in report["forecasts"]:
        months = ", ".join(f"{p['month'][:7]}: {_fmt(p['value'])}" for p in f["forecast"])
        lines.append(f"| {f['target']} | {f['model']} | {months} | {_fmt(f['backtest_mae'])} | {_fmt(f['naive_mae'])} |")
    evaluation = report.get("evaluation", {})
    lines += ["", "## Check against history",
              f"- Checks passed: {evaluation.get('checks_passed')}",
              f"- Model beats naive forecast in {_fmt(evaluation.get('model_win_rate_vs_naive'))}% of tested series"]
    return "\n".join(lines)


class MonthlyReportService:
    def __init__(self, loader: HistoricalDataLoader | None = None, recommender: Recommender | None = None,
                 client: OllamaClient | None = None):
        self.loader = loader or HistoricalDataLoader()
        self.recommender = recommender or Recommender()
        self.client = client or llm
        self._scheduler = None

    async def summarise(self, report: RecommendationReport) -> None:
        findings = [{"title": f.title, "detail": f.detail} for f in report.findings]
        forecasts = [{"target": f.target, "forecast": f.forecast} for f in report.forecasts[:3]]
        recs = [{"action": r.action, "reason": r.reason, "priority": r.priority} for r in report.recommendations]
        try:
            data = await self.client.chat_json([
                {"role": "system", "content": recommendation_system_prompt(report.language)},
                {"role": "user", "content": build_recommendation_prompt(findings, to_native(forecasts), recs,
                                                                        report.last_complete_month)},
            ])
            report.summary = str(data.get("summary") or "").strip()
            report.priorities = [str(p) for p in data.get("priorities") or []][:5]
        except LLMError as exc:
            logger.warning("LLM summary skipped: %s", exc)
        if not report.summary:
            report.summary = " ".join(f.detail for f in report.findings if f.detail)
            report.priorities = [r.action for r in report.recommendations[:5]]

    async def generate(self, language: str = "ar", use_llm: bool = True, save: bool = True) -> dict[str, Any]:
        data, reference_date = await self.loader.load()
        report = self.recommender.build(data, reference_date, language)
        if use_llm:
            await self.summarise(report)
        else:
            report.summary = " ".join(f.detail for f in report.findings if f.detail)
            report.priorities = [r.action for r in report.recommendations[:5]]
        result = report.to_dict()
        if save:
            result["saved_to"] = [str(p) for p in self.save(result)]
        return result

    @staticmethod
    def save(result: dict[str, Any], folder: Path | None = None) -> list[Path]:
        folder = folder or settings.path("reports")
        folder.mkdir(parents=True, exist_ok=True)
        stem = f"monthly_{result['last_complete_month']}_{result['language']}"
        json_path, md_path = folder / f"{stem}.json", folder / f"{stem}.md"
        json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        md_path.write_text(to_markdown(result), encoding="utf-8")
        return [json_path, md_path]

    def start_scheduler(self) -> None:
        if not settings.monthly_report_enabled or self._scheduler is not None:
            return
        from apscheduler.schedulers.asyncio import AsyncIOScheduler

        async def job() -> None:
            for language in ("ar", "en"):
                try:
                    await self.generate(language)
                    logger.info("Monthly report (%s) generated", language)
                except Exception:  # noqa: BLE001 - keep the scheduler alive
                    logger.exception("Monthly report (%s) failed", language)

        self._scheduler = AsyncIOScheduler(timezone=settings.timezone)
        self._scheduler.add_job(job, "cron", day=settings.monthly_report_day, hour=settings.monthly_report_hour,
                                id="monthly_report", replace_existing=True)
        self._scheduler.start()
        logger.info("Monthly report scheduled: day %s at %s:00", settings.monthly_report_day,
                    settings.monthly_report_hour)

    def stop_scheduler(self) -> None:
        if self._scheduler is not None:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None


monthly_reports = MonthlyReportService()
