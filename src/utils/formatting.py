from __future__ import annotations

import os
import re
import unicodedata
from typing import List, Optional, Sequence, Union


LOSSLESS_EXTS = {".flac", ".alac", ".wav", ".ape", ".wv", ".aiff", ".aif", ".tta"}
DEFAULT_FORMAT_PREFERENCE = ["aiff", "flac", "wav"]


def normalize_format_preference(preference: Union[str, Sequence[str], None]) -> List[str]:
    """Return a clean, de-duplicated format preference list.

    Accepts a comma-separated string, any iterable, or None. Only whitelisted
    values are kept (aiff/aif, flac, wav, alac, lossy). Falls back to the
    default order when nothing valid is provided.
    """

    if preference is None:
        candidates = list(DEFAULT_FORMAT_PREFERENCE)
    elif isinstance(preference, str):
        candidates = [p.strip() for p in preference.split(",") if p.strip()]
    else:
        candidates = [str(p).strip() for p in preference if str(p).strip()]

    normalized: List[str] = []
    allowed = {"aiff", "aif", "flac", "wav", "alac", "lossy"}
    for raw in candidates:
        key = raw.lower().lstrip(".")
        if key == "aif":
            key = "aiff"
        if key in allowed and key not in normalized:
            normalized.append(key)
    if not normalized:
        normalized = list(DEFAULT_FORMAT_PREFERENCE)
    return normalized


def slugify(value: str, allow_unicode: bool = False) -> str:
    """Return a filesystem-friendly slug.

    Similar to Django's slugify, but simpler.
    """
    value = str(value)
    if allow_unicode:
        value = unicodedata.normalize("NFKC", value)
    else:
        value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^\w\s-]", "", value).strip().lower()
    return re.sub(r"[\s_-]+", "-", value)


def safe_filename(name: str) -> str:
    """Convert to a safe filename while preserving spaces and dashes."""
    # normalize
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    # remove bad chars
    name = re.sub(r'[\\/:*?"<>|]', "", name)
    # collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()
    return name


def extract_playlist_id(url_or_id: str) -> str:
    """Extract a Spotify playlist ID from a URL or return the ID verbatim."""
    if "playlist" in url_or_id and "/" in url_or_id:
        # handle URLs like https://open.spotify.com/playlist/<id>?si=...
        m = re.search(r"playlist/([a-zA-Z0-9]+)", url_or_id)
        if m:
            return m.group(1)
    if url_or_id.startswith("spotify:playlist:"):
        return url_or_id.split(":")[-1]
    return url_or_id


def is_lossless_path(path: str) -> bool:
    _, ext = os.path.splitext(path.lower())
    return ext in LOSSLESS_EXTS


def preferred_ext_score(path: str, preferred_ext: Union[str, Sequence[str], None] = None) -> int:
    """Higher is better; prioritize the user-selected format order."""

    ext = os.path.splitext(path.lower())[1]
    preference = normalize_format_preference(preferred_ext)

    baseline_order: List[str] = []
    for pref in preference:
        if pref == "lossy":
            baseline_order.append("lossy")
        else:
            baseline_order.append("." + pref)
    # Add sensible fallbacks to keep other lossless formats ranked
    baseline_order.extend([".aiff", ".aif", ".flac", ".wav", ".alac"])

    ordered: List[str] = []
    for e in baseline_order:
        if e not in ordered:
            ordered.append(e)
    weights = {ext_name: score for score, ext_name in zip(range(len(ordered), 0, -1), ordered)}

    if ext in weights:
        return weights[ext]
    if not is_lossless_path(path) and "lossy" in weights:
        return weights["lossy"]
    return 0


def basename_any(path: str) -> str:
    """Return filename component regardless of slash type (handles Windows paths on *nix)."""
    normalized = path.replace("\\", "/")
    if "/" not in normalized:
        return normalized
    return normalized.rsplit("/", 1)[-1]
