from __future__ import annotations

import os
import re
import unicodedata
from typing import Optional


LOSSLESS_EXTS = {".flac", ".alac", ".wav"}


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
    name = re.sub(r"[\\/:*?"<>|]", "", name)
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


def preferred_ext_score(path: str) -> int:
    """Higher is better. Prefer FLAC > ALAC > WAV."""
    ext = os.path.splitext(path.lower())[1]
    if ext == ".flac":
        return 3
    if ext == ".alac":
        return 2
    if ext == ".wav":
        return 1
    return 0
