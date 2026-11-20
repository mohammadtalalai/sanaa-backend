from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_CODE_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


class LLMError(RuntimeError):
    """Ollama is unreachable or returned an unusable answer."""


def extract_json(raw: str) -> dict[str, Any]:
    """Parse the first JSON object in a model answer (handles <think> blocks and ``` fences)."""
    cleaned = _THINK_BLOCK.sub("", raw or "").strip()
    fenced = _CODE_FENCE.search(cleaned)
    if fenced:
        cleaned = fenced.group(1).strip()
    try:
        value = json.loads(cleaned)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(cleaned)):
            char = cleaned[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    try:
                        value = json.loads(cleaned[start:index + 1])
                        if isinstance(value, dict):
                            return value
                    except json.JSONDecodeError:
                        break
                    break
        start = cleaned.find("{", start + 1)
    raise LLMError("The model did not return valid JSON")


class OllamaClient:
    def __init__(self, base_url: str | None = None, model: str | None = None):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model

    def _client(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, timeout=timeout or settings.ollama_timeout_seconds)

    async def chat(self, messages: list[dict[str, str]], *, json_mode: bool = False,
                   temperature: float | None = None, num_predict: int | None = None) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "keep_alive": settings.ollama_keep_alive,
            "options": {
                "temperature": settings.ollama_temperature if temperature is None else temperature,
                "num_ctx": settings.ollama_num_ctx,
                "num_predict": num_predict or settings.ollama_num_predict,
            },
        }
        if json_mode:
            payload["format"] = "json"
        if not settings.ollama_think:
            payload["think"] = False
        try:
            async with self._client() as client:
                response = await client.post("/api/chat", json=payload)
                if response.status_code == 400 and "think" in payload and "think" in response.text.lower():
                    payload.pop("think")  # model without thinking support
                    response = await client.post("/api/chat", json=payload)
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise LLMError(f"Ollama did not answer within {settings.ollama_timeout_seconds:.0f}s") from exc
        except httpx.HTTPStatusError as exc:
            raise LLMError(f"Ollama error {exc.response.status_code}: {exc.response.text[:300]}") from exc
        except httpx.HTTPError as exc:
            raise LLMError(f"Cannot reach Ollama at {self.base_url}: {exc}") from exc
        content = response.json().get("message", {}).get("content", "")
        return _THINK_BLOCK.sub("", content).strip()

    async def chat_json(self, messages: list[dict[str, str]], **kwargs: Any) -> dict[str, Any]:
        raw = await self.chat(messages, json_mode=True, **kwargs)
        try:
            return extract_json(raw)
        except LLMError:
            logger.warning("Invalid JSON from model, retrying once")
            retry = messages + [{"role": "assistant", "content": raw},
                                {"role": "user", "content": "Return ONLY one valid JSON object, nothing else."}]
            return extract_json(await self.chat(retry, json_mode=True, **kwargs))

    async def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            async with self._client() as client:
                response = await client.post("/api/embed", json={"model": settings.ollama_embed_model,
                                                                 "input": texts})
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LLMError(f"Embedding request failed: {exc}") from exc
        return response.json().get("embeddings", [])

    async def health(self) -> dict[str, Any]:
        try:
            async with self._client(timeout=5) as client:
                version = (await client.get("/api/version")).json().get("version")
                tags = (await client.get("/api/tags")).json().get("models", [])
        except httpx.HTTPError as exc:
            return {"reachable": False, "base_url": self.base_url, "error": str(exc)}
        names = [m.get("name", "") for m in tags]
        wanted = self.model if ":" in self.model else f"{self.model}:latest"
        return {"reachable": True, "base_url": self.base_url, "version": version, "model": self.model,
                "model_installed": wanted in names or self.model in names, "installed_models": names}


llm = OllamaClient()
