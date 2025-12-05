import os
from pathlib import Path
import types

import downloader as dl
from spotify_client import Track
import soulseek_client as sl


class DummySoulseek(sl.SoulseekClient):
    def __init__(self):
        pass
    def search_lossless(self, query: str, **kw):
        # Two candidates; first fails, second succeeds
        return [
            sl.Candidate(username="u1", filename="/Music/file1.flac", size=1, ext_score=3, reported_speed=1000, peer_queue_len=0),
            sl.Candidate(username="u2", filename="/Music/file2.flac", size=1, ext_score=3, reported_speed=2000, peer_queue_len=0),
        ]
    def enqueue_download(self, user, filename, size):
        return True
    def wait_for_completion(self, user, target, timeout_s=10.0, poll_s=0.1, progress_cb=None):
        # Simulate that only file2 completes
        if "file2" in target:
            if progress_cb:
                progress_cb("complete", 100.0)
            return True, {"filename": f"/Music/{target}"}
        return False, {"filename": f"/Music/{target}", "state": "failed"}


def test_downloader_moves_file(tmp_path, monkeypatch):
    # Prepare fake slskd download dir with file2 present
    slskd_dir = tmp_path / "slskd"
    slskd_dir.mkdir()
    (slskd_dir / "file2.flac").write_bytes(b"ok")
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    d = dl.Downloader(slsk=DummySoulseek(), slskd_download_dir=str(slskd_dir), output_dir=str(out_dir), max_retries=3)
    outcome = d.process_track(Track(artist="Artist 1", title="Song A", album="Album X"))
    assert outcome.success
    assert outcome.path is not None
    assert Path(outcome.path).exists()
