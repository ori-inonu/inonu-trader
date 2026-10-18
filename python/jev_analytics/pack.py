"""Validation and atomic writing of the pack. The pack describes the market and never carries an action."""

from __future__ import annotations

import json
import math
import os
import tempfile
from pathlib import Path
from typing import Any

from . import PACK_KIND, PACK_SCHEMA_VERSION

# A key with one of these exact names would be a verdict, not a measurement.
FORBIDDEN_KEYS = frozenset({"buy", "sell", "hold", "action", "signal", "signals", "recommend", "recommendation", "vote", "side"})
OI_REGIMES = {"long_buildup", "short_buildup", "short_covering", "long_unwind", "mixed"}
RANGE_STATES = {"inside", "above", "below"}


def _keys(value: Any):
    if isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from _keys(item)
    elif isinstance(value, list):
        for item in value:
            yield from _keys(item)


def _finite(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(_finite(v) for v in value.values())
    if isinstance(value, list):
        return all(_finite(v) for v in value)
    return True


def validate_pack(pack: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if pack.get("schemaVersion") != PACK_SCHEMA_VERSION or pack.get("kind") != PACK_KIND:
        problems.append("schema")
    if not isinstance(pack.get("generatedAtMs"), int) or pack["generatedAtMs"] <= 0:
        problems.append("generatedAtMs")
    bad = sorted(FORBIDDEN_KEYS.intersection(_keys(pack)))
    if bad:
        problems.append("forbidden keys: " + ", ".join(bad))
    if not _finite(pack):
        problems.append("non finite number")
    instruments = pack.get("instruments")
    if not isinstance(instruments, dict):
        problems.append("instruments")
        return problems
    for inst_id, entry in instruments.items():
        features = entry.get("features") if isinstance(entry, dict) else None
        if not isinstance(features, dict) or entry.get("instId") != inst_id:
            problems.append(f"{inst_id}: entry")
            continue
        derivatives = features.get("derivatives")
        if derivatives is not None and derivatives.get("oiPriceRegime") not in OI_REGIMES | {None}:
            problems.append(f"{inst_id}: oiPriceRegime")
        trend = features.get("trend")
        if trend is not None and trend.get("regime") not in {"up", "down", "range"}:
            problems.append(f"{inst_id}: regime")
        structure = features.get("structure")
        for tf in ("smc15m", "smc1h"):
            digest = structure.get(tf) if structure is not None else None
            if digest is not None and digest.get("rangeState") not in RANGE_STATES | {None}:
                problems.append(f"{inst_id}: {tf} rangeState")
        if features.get("onchain") is not None:
            problems.append(f"{inst_id}: onchain must be null in this version")
    return problems


def write_atomic(path: Path, pack: dict[str, Any]) -> None:
    problems = validate_pack(pack)
    if problems:
        raise ValueError("invalid pack: " + "; ".join(problems))
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf8", newline="\n") as handle:
            json.dump(pack, handle, separators=(",", ":"), allow_nan=False)
            handle.write("\n")
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise
