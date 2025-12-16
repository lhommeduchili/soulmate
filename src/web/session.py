from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException
from spotipy import Spotify
from spotipy.oauth2 import SpotifyOAuth

SESSION_COOKIE_NAME = "soulmate_session"


@dataclass
class SessionData:
    session_id: str
    spotify_user_id: str
    display_name: str
    token_info: Dict[str, Any]
    created_at: float
    updated_at: float


# In-memory store; if you want durability, back this with Redis/DB.
SESSIONS: Dict[str, SessionData] = {}


from src.web.cache import NoCacheHandler

def _spotify_auth_manager() -> SpotifyOAuth:
    try:
        return SpotifyOAuth(
            scope="user-library-read playlist-read-private",
            cache_handler=NoCacheHandler(),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Spotify auth misconfigured: {exc}")


def create_session(token_info: Dict[str, Any]) -> SessionData:
    """Create a session from a Spotify token_info and return the session data."""
    access_token = token_info.get("access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Spotify access token missing")
    sp = Spotify(auth=access_token)
    profile = sp.me()
    user_id = profile.get("id") or ""
    display_name = profile.get("display_name") or profile.get("id") or "spotify_user"
    session_id = secrets.token_urlsafe(32)
    now = time.time()
    session = SessionData(
        session_id=session_id,
        spotify_user_id=user_id,
        display_name=display_name,
        token_info=token_info,
        created_at=now,
        updated_at=now,
    )
    SESSIONS[session_id] = session
    return session


def get_session(session_id: Optional[str]) -> SessionData:
    if not session_id or session_id not in SESSIONS:
        raise HTTPException(status_code=401, detail="Sesión no válida o expirada")
    return SESSIONS[session_id]


def refresh_session_if_needed(session: SessionData) -> SessionData:
    """Refresh Spotify token if expired; updates the session in-place."""
    auth_manager = _spotify_auth_manager()
    token_info = session.token_info
    try:
        if auth_manager.is_token_expired(token_info):
            refresh_token = token_info.get("refresh_token")
            if not refresh_token:
                raise HTTPException(status_code=401, detail="Spotify session expired; please login again")
            new_info = auth_manager.refresh_access_token(refresh_token)
            if "refresh_token" not in new_info and refresh_token:
                new_info["refresh_token"] = refresh_token
            session.token_info = new_info
            session.updated_at = time.time()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Spotify refresh failed: {exc}")
    return session


def destroy_session(session_id: Optional[str]) -> None:
    if session_id and session_id in SESSIONS:
        SESSIONS.pop(session_id, None)

