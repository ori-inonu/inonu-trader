"""Market structure: swing pivots and clustered support and resistance levels. Spec section 6."""

from __future__ import annotations

from typing import Sequence


def pivots(h: Sequence[float], l: Sequence[float], k: int = 3) -> list[dict[str, float]]:
    """Swing pivots: a high strictly above the k highs on its left and at least as high as the k on its right,
    a low strictly below the k lows on its left and at most as low as the k on its right.

    Ties are allowed on the right only, so a flat top or bottom yields exactly one pivot (its first bar). The newest
    k bars cannot be confirmed yet and are never pivots.
    """
    if k < 1:
        raise ValueError("k must be positive")
    out: list[dict[str, float]] = []
    for i in range(k, len(h) - k):
        if all(h[i] > h[j] for j in range(i - k, i)) and all(h[i] >= h[j] for j in range(i + 1, i + k + 1)):
            out.append({"index": float(i), "price": h[i], "kind": 1.0})
        if all(l[i] < l[j] for j in range(i - k, i)) and all(l[i] <= l[j] for j in range(i + 1, i + k + 1)):
            out.append({"index": float(i), "price": l[i], "kind": -1.0})
    return out


def cluster_levels(prices: Sequence[float], tolerance: float) -> list[dict[str, float]]:
    """Group sorted prices: a group spans at most `tolerance` measured from its lowest price.

    Returns one level per group, ascending: px = mean of the group, touches = how many pivots joined it.
    """
    if tolerance < 0:
        raise ValueError("tolerance must not be negative")
    levels: list[dict[str, float]] = []
    group: list[float] = []
    for price in sorted(prices):
        if group and price - group[0] > tolerance:
            levels.append({"px": sum(group) / len(group), "touches": float(len(group))})
            group = []
        group.append(price)
    if group:
        levels.append({"px": sum(group) / len(group), "touches": float(len(group))})
    return levels
