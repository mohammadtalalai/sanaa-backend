from __future__ import annotations

import logging
import math

from app.ai.llm import LLMError, llm

logger = logging.getLogger(__name__)


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


class EmbeddingIndex:
    def __init__(self) -> None:
        self._vectors: list[list[float]] = []
        self._ready = False
        self.available = True

    async def build(self, texts: list[str]) -> None:
        if self._ready or not self.available:
            return
        try:
            self._vectors = await llm.embed(texts)
            self._ready = len(self._vectors) == len(texts)
        except LLMError as exc:
            logger.warning("Embeddings disabled: %s", exc)
            self.available = False

    async def rank(self, query: str, top_k: int) -> list[int]:
        if not self._ready:
            return []
        try:
            vector = (await llm.embed([query]))[0]
        except (LLMError, IndexError):
            return []
        scores = sorted(((cosine(vector, v), i) for i, v in enumerate(self._vectors)), reverse=True)
        return [i for _, i in scores[:top_k]]
