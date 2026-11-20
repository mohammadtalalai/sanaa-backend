from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Language = Literal["ar", "en"]


class AskRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=2000, examples=["What are our profits this month?"])
    language: Language | None = None
    save_report: bool = False


class Report(BaseModel):
    answer: str
    highlights: list[str] = []
    recommendations: list[str] = []
    statistics: dict[str, Any] = {}
    columns: list[str] = []
    notes: list[str] = []
    comparison: dict[str, Any] | None = None


class AskResponse(BaseModel):
    success: bool = True
    question: str
    language: Language
    domain: str
    domains: list[str]
    reference_date: str
    sql: str | None
    reason: str = ""
    rows: list[dict[str, Any]]
    row_count: int
    truncated: bool
    attempts: int
    errors: list[str] = []
    report: Report
    elapsed_ms: float
    saved_report: str | None = None


class VoiceAskResponse(AskResponse):
    transcript: str
    audio_language: str | None = None


class ValidateSQLRequest(BaseModel):
    sql: str = Field(..., min_length=1, max_length=10000)


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=3000)
    language: Language | None = None


class RecommendationRequest(BaseModel):
    language: Language = "ar"
    use_llm: bool = True
    save: bool = True


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000, examples=["عايز دولاب"])
    session_id: str | None = Field(None, max_length=64)
    language: Language | None = None


class ChatResponse(BaseModel):
    session_id: str
    language: Language
    status: str
    awaiting: str | None
    reply: str
    collected: dict[str, Any]
    quotation: dict[str, Any] | None = None
    design: dict[str, Any] | None = None


class DesignRequest(BaseModel):
    quotation_no: str = Field(..., max_length=32)


class DesignDecision(BaseModel):
    approved: bool
    feedback: str | None = Field(None, max_length=1000)


class LoginRequest(BaseModel):
    customer_id: int = Field(..., ge=1)
    order_no: str = Field(..., min_length=1, max_length=40)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    customer_id: int
