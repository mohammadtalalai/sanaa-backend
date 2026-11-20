from __future__ import annotations

import datetime as dt
import secrets
from dataclasses import asdict, dataclass, field
from typing import Any

MAX_HISTORY = 40

# collecting -> confirming -> quoted -> design_ready -> approved
STATUSES = ("collecting", "confirming", "quoted", "design_ready", "approved", "cancelled")


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


@dataclass
class ConversationState:
    session_id: str = field(default_factory=lambda: secrets.token_urlsafe(18))
    language: str = "ar"
    status: str = "collecting"
    awaiting: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
    quotation_no: str | None = None
    design_id: str | None = None
    history: list[dict[str, str]] = field(default_factory=list)
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)

    def add(self, role: str, text: str) -> None:
        self.history.append({"role": role, "text": text, "at": _now()})
        self.history = self.history[-MAX_HISTORY:]
        self.updated_at = _now()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ConversationState:
        known = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        return cls(**known)
