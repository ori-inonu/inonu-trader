"""TTL cache with stale fallback and per key backoff. A fetch may return None to record a known absence."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

STALE_FACTOR = 2.0
BACKOFF_BASE_S = 5.0
BACKOFF_MAX_S = 300.0


@dataclass(frozen=True)
class CacheResult:
    value: Any
    #: "fresh" served from cache inside the TTL, "fetched" just fetched, "stale" an old value after a failed
    #: refresh (at most STALE_FACTOR * ttl old), "missing" nothing usable.
    status: str
    age_s: Optional[float]
    error: Optional[str]


class _Entry:
    __slots__ = ("value", "fetched_at", "failures", "retry_at", "error")

    def __init__(self) -> None:
        self.value: Any = None
        self.fetched_at: Optional[float] = None
        self.failures = 0
        self.retry_at = 0.0
        self.error: Optional[str] = None


class TtlCache:
    def __init__(self, clock: Callable[[], float]) -> None:
        self._clock = clock
        self._items: dict[str, _Entry] = {}

    def get(self, key: str, ttl_s: float, fetch: Callable[[], Any], error_code: Callable[[Exception], str]) -> CacheResult:
        now = self._clock()
        entry = self._items.setdefault(key, _Entry())
        age = None if entry.fetched_at is None else now - entry.fetched_at
        if age is not None and age < ttl_s:
            return CacheResult(entry.value, "fresh", age, None)
        if now >= entry.retry_at:
            try:
                value = fetch()
            except Exception as exc:  # noqa: BLE001 - every failure becomes a code, never a crash
                entry.failures += 1
                entry.error = error_code(exc)
                entry.retry_at = now + min(BACKOFF_MAX_S, BACKOFF_BASE_S * 2 ** (entry.failures - 1))
            else:
                entry.value, entry.fetched_at, entry.failures, entry.retry_at, entry.error = value, now, 0, 0.0, None
                return CacheResult(value, "fetched", 0.0, None)
        age = None if entry.fetched_at is None else now - entry.fetched_at
        if age is not None and age <= ttl_s * STALE_FACTOR:
            return CacheResult(entry.value, "stale", age, entry.error)
        return CacheResult(None, "missing", age, entry.error or "fetch_failed")
