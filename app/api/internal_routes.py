from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from app.api.schemas import (
    AskRequest,
    AskResponse,
    RecommendationRequest,
    SpeakRequest,
    ValidateSQLRequest,
    VoiceAskResponse,
)
from app.core.security import require_internal_api_key
from app.internal_services.analysis.analyzer import analyzer
from app.internal_services.analysis.report_generator import save_markdown
from app.internal_services.analysis.sql_validator import SQLValidator
from app.internal_services.recommendations.monthly_report import monthly_reports
from app.internal_services.voice.speech_to_text import speech_to_text
from app.internal_services.voice.text_to_speech import synthesize

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_api_key)])


async def _ask(question: str, language: str | None, save: bool) -> dict:
    result = await analyzer.ask(question, language)
    result["saved_report"] = str(save_markdown(result)) if save and result.get("sql") else None
    return result


@router.post("/ask", response_model=AskResponse)
async def ask(body: AskRequest):
    return await _ask(body.question, body.language, body.save_report)


@router.post("/sql/validate")
async def validate_sql(body: ValidateSQLRequest):
    result = SQLValidator().validate(body.sql)
    return {"valid": result.valid, "sql": result.sql, "error": result.error, "tables": result.tables}


@router.post("/voice/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str | None = Form(None)):
    return await speech_to_text.transcribe(await audio.read(), language)


@router.post("/voice/ask", response_model=VoiceAskResponse)
async def voice_ask(audio: UploadFile = File(...), language: str | None = Form(None)):
    heard = await speech_to_text.transcribe(await audio.read(), language)
    result = await _ask(heard["text"], heard["language"] if heard["language"] in ("ar", "en") else None, False)
    return {**result, "transcript": heard["text"], "audio_language": heard["language"]}


@router.post("/voice/speak")
async def speak(body: SpeakRequest):
    audio = await synthesize(body.text, body.language)
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/recommendations")
async def recommendations(body: RecommendationRequest):
    return await monthly_reports.generate(body.language, use_llm=body.use_llm, save=body.save)
