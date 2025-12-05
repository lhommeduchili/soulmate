from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from spotipy import Spotify
from spotipy.oauth2 import SpotifyClientCredentials

from src.utils.formatting import extract_playlist_id


@dataclass
class Track:
    artist: str
    title: str
    album: str

    def query_strings(self) -> Iterable[str]:
        # Try a couple of patterns for better Soulseek hits
        base = f"{self.artist} - {self.title}"
        yield base
        if self.album:
            yield f"{self.artist} - {self.title} {self.album}"


class SpotifyClient:
    """Thin wrapper around Spotipy to fetch playlist info and tracks."""

    def __init__(self, auth_manager=None, access_token: Optional[str] = None) -> None:
        if access_token:
            self.sp = Spotify(auth=access_token)
        elif auth_manager:
            self.sp = Spotify(auth_manager=auth_manager)
        else:
            client_id = os.getenv("SPOTIPY_CLIENT_ID")
            client_secret = os.getenv("SPOTIPY_CLIENT_SECRET")
            if not client_id or not client_secret:
                raise RuntimeError(
                    "Missing Spotify credentials. Set SPOTIPY_CLIENT_ID and SPOTIPY_CLIENT_SECRET."
                )
            auth = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
            self.sp = Spotify(auth_manager=auth)

    def get_playlist(self, playlist_id_or_url: str) -> Tuple[str, List[Track]]:
        pid = extract_playlist_id(playlist_id_or_url)
        meta = self.sp.playlist(pid, fields="name,tracks.total")  # type: ignore
        name: str = meta["name"]
        # paginate tracks
        tracks: List[Track] = []
        limit = 100
        offset = 0
        while True:
            items = self.sp.playlist_items(
                pid,
                limit=limit,
                offset=offset,
                fields="items(track(name,artists(name),album(name),type)),total,next",
            )
            for it in items["items"]:
                t = it.get("track")
                if not t or t.get("type") != "track":
                    continue  # skip episodes etc.
                title = t.get("name") or ""
                artists = t.get("artists") or []
                artist = artists[0]["name"] if artists else "Unknown Artist"
                album = (t.get("album") or {}).get("name") or ""
                tracks.append(Track(artist=artist, title=title, album=album))
            if not items.get("next"):
                break
            offset += limit
        return name, tracks
