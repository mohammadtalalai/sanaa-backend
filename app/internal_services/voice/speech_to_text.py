from __future__ import annotations

import asyncio
import io
import logging
import threading
from typing import Any

from app.core.config import settings
from app.core.exceptions import AppError, ServiceUnavailableError, ValidationFailedError

logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 25 * 1024 * 1024


class SpeechToText:
    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self.device = None

    def _load(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise ServiceUnavailableError("faster-whisper is not installed") from exc
            candidates = ([("cuda", "float16"), ("cpu", "int8")] if settings.whisper_device == "auto"
                          else [(settings.whisper_device,
                                 "int8" if settings.whisper_device == "cpu" else "float16")])
            last_error: Exception | None = None
            for device, compute in candidates:
                compute_type = compute if settings.whisper_compute_type == "auto" else settings.whisper_compute_type
                try:
                    self._model = WhisperModel(settings.whisper_model, device=device, compute_type=compute_type)
                    self.device = device
                    logger.info("Whisper '%s' loaded on %s (%s)", settings.whisper_model, device, compute_type)
                    return self._model
                except Exception as exc:  # noqa: BLE001 - try the next device
                    last_error = exc
                    logger.warning("Whisper could not load on %s: %s", device, exc)
            raise ServiceUnavailableError(f"Speech model could not be loaded: {last_error}")

    def _transcribe_sync(self, audio: bytes, language: str | None) -> dict[str, Any]:
        model = self._load()
        segments, info = model.transcribe(io.BytesIO(audio), language=language, vad_filter=True, beam_size=5)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return {"text": text, "language": info.language, "duration_seconds": round(info.duration, 2)}

    async def transcribe(self, audio: bytes, language: str | None = None) -> dict[str, Any]:
        if not audio:
            raise ValidationFailedError("The audio file is empty")
        if len(audio) > MAX_AUDIO_BYTES:
            raise ValidationFailedError("The audio file is larger than 25 MB")
        lang = language if language in ("ar", "en") else None
        try:
            result = await asyncio.to_thread(self._transcribe_sync, audio, lang)
        except AppError:
            raise
        except Exception as exc:  # noqa: BLE001 - corrupt or unsupported audio
            logger.exception("Transcription failed")
            raise ValidationFailedError(f"Could not read or transcribe the audio file: {exc}") from exc
        if not result["text"]:
            raise ValidationFailedError("No speech was detected in the audio")
        return result


speech_to_text = SpeechToText()
