import types
import pytest

import soulseek_client as sl


class DummySearchesApi:
    def __init__(self):
        self.calls = 0
        self._id = "sid-1"

    def search_text(self, **kw):
        return {"id": self._id}

    def get_all(self):
        return [{"id": self._id}]

    def search_responses(self, sid):
        # emulate slskd: list of users, each with files
        return [
            {
                "username": "u1",
                "files": [
                    {"filename": "/Music/Artist 1 - Song A.flac", "size": 123456, "uploadSpeed": 500000, "queueLength": 0},
                    {"filename": "/Music/Artist 1 - Song A.mp3", "size": 99999},
                ],
            },
            {
                "username": "u2",
                "files": [
                    {"filename": "/Music/Artist 1 - Song A.wav", "size": 1234567, "uploadSpeed": 1000000, "queueLength": 1},
                ],
            },
            {
                "username": "u3",
                "files": [
                    {"filename": "/Music/Artist 1 - Song A.ape", "size": 2345678, "uploadSpeed": 800000, "queueLength": 2},
                ],
            },
        ]


class DummyTransfersApi:
    def __init__(self):
        self.enqueued = []

    def enqueue(self, username, files):
        self.enqueued.append((username, tuple(files)))
        return True

    def get_all_downloads(self, includeRemoved=False):
        return []

    def get_downloads(self, username):
        # Return a dict mapping ids to downloads
        return {
            "1": {"filename": "/Music/Artist 1 - Song A.flac", "state": "complete"},
        }


class DummyClient:
    def __init__(self, *a, **kw):
        self.searches = DummySearchesApi()
        self.transfers = DummyTransfersApi()


def test_search_lossless(monkeypatch):
    monkeypatch.setattr(sl, "slskd_api", types.SimpleNamespace(SlskdClient=lambda **kw: DummyClient()))
    client = sl.SoulseekClient("http://localhost:5030", api_key="x")
    cands = client.search_lossless("Artist 1 - Song A")
    assert len(cands) == 3  # flac + wav + ape
    assert cands[0].filename.endswith(".wav")
    assert any(c.filename.endswith(".ape") for c in cands)


def test_enqueue_and_wait(monkeypatch):
    monkeypatch.setattr(sl, "slskd_api", types.SimpleNamespace(SlskdClient=lambda **kw: DummyClient()))
    client = sl.SoulseekClient("http://localhost:5030", api_key="x")
    ok = client.enqueue_download("u1", "/Music/Artist 1 - Song A.flac", 123)
    assert ok
    done, meta = client.wait_for_completion("u1", "Artist 1 - Song A.flac", timeout_s=1.0, poll_s=0.01)
    assert done is True
    assert meta is not None
