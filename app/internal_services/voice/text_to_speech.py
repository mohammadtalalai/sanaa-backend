from __future__ import annotations

import logging

from app.ai.language import detect_language
from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError, ValidationFailedError

logger = logging.getLogger(__name__)
MAX_TTS_CHARS = 3000


async def synthesize(text: str, language: str | None = None) -> bytes:
    text = (text or "").strip()
    if not text:
        raise ValidationFailedError("Text is empty")
    text = text[:MAX_TTS_CHARS]
    language = language if language in ("ar", "en") else detect_language(text)
    voice = settings.tts_voice_ar if language == "ar" else settings.tts_voice_en
    try:
        import edge_tts

        communicate = edge_tts.Communicate(text, voice)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
    except ImportError as exc:
        raise ServiceUnavailableError("edge-tts is not installed") from exc
    except Exception as exc:  # noqa: BLE001 - network/service errors
        logger.warning("Text to speech failed: %s", exc)
        raise ServiceUnavailableError(f"Text to speech is not available (internet needed): {exc}") from exc
    if not audio:
        raise ServiceUnavailableError("Text to speech returned no audio")
    return bytes(audio)
