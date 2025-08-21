import types
import builtins
import pytest

import spotify_client as sc


class DummySpotipy:
    def __init__(self, *a, **kw):
        pass

    def playlist(self, pid, fields=None):
        return {"name": "My Playlist", "tracks": {"total": 2}}

    def playlist_items(self, pid, limit=100, offset=0, fields=None):
        if offset == 0:
            return {
                "items": [
                    {"track": {"type": "track", "name": "Song A", "artists": [{"name": "Artist 1"}], "album": {"name": "Album X"}}},
                    {"track": {"type": "track", "name": "Song B", "artists": [{"name": "Artist 2"}], "album": {"name": "Album Y"}}},
                ],
                "total": 2,
                "next": None,
            }
        return {"items": [], "total": 2, "next": None}


def test_get_playlist(monkeypatch):
    # Fake env
    monkeypatch.setenv("SPOTIPY_CLIENT_ID", "x")
    monkeypatch.setenv("SPOTIPY_CLIENT_SECRET", "y")
    # Patch Spotipy
    monkeypatch.setattr(sc, "Spotify", lambda auth_manager=None: DummySpotipy())
    monkeypatch.setattr(sc, "SpotifyClientCredentials", lambda client_id=None, client_secret=None: object())
    client = sc.SpotifyClient()
    name, tracks = client.get_playlist("spotify:playlist:abc123")
    assert name == "My Playlist"
    assert len(tracks) == 2
    assert tracks[0].artist == "Artist 1"
    assert tracks[0].title == "Song A"
