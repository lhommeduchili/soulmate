from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from tenacity import retry, stop_after_attempt, wait_fixed

try:
    import slskd_api  # type: ignore
except Exception as e:  # pragma: no cover - import-time error shown at runtime
    slskd_api = None  # type: ignore

from src.utils.formatting import is_lossless_path, preferred_ext_score


@dataclass
class Candidate:
    username: str
    filename: str
    size: int
    ext_score: int
    reported_speed: Optional[float] = None  # bytes/s
    peer_queue_len: Optional[int] = None

    def score(self) -> Tuple[int, float, int]:
        """Sort key: ext preference, speed (higher better), queue len (lower better)."""
        speed = float(self.reported_speed or 0.0)
        q = int(self.peer_queue_len or 0)
        # negative queue so that lower queue comes first when sorting descending by tuple
        return (self.ext_score, speed, -q)


class SoulseekClient:
    """Wrapper around slskd-api for search and download."""

    def __init__(
        self,
        host: str,
        api_key: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        verify_ssl: bool = True,
        timeout: Optional[float] = 30.0,
        preferred_ext: str = "wav",
    ) -> None:
        if slskd_api is None:
            raise RuntimeError(
                "slskd-api is not installed. Please install it (`pip install slskd-api`) and ensure slskd is running."
            )
        self.preferred_ext = preferred_ext
        self.client = slskd_api.SlskdClient(  # type: ignore[attr-defined]
            host=host,
            api_key=api_key,
            username=username,
            password=password,
            verify_ssl=verify_ssl,
            timeout=timeout,
        )

    def _normalize_resp(self, r: Dict[str, Any], preferred_ext: str) -> Candidate:
        """Best-effort mapping from slskd response dict to Candidate."""
        username = r.get("username") or r.get("user") or ""
        # filename may appear under different keys; 'filename' seems standard.
        filename = r.get("filename") or r.get("file") or r.get("path") or ""
        size = int(r.get("size") or r.get("filesize") or 0)
        speed = r.get("uploadSpeed") or r.get("speed") or r.get("userSpeed") or None
        if isinstance(speed, str):
            try:
                speed = float(speed)
            except Exception:
                speed = None
        qlen = r.get("queueLength") or r.get("queue") or None
        try:
            qlen = int(qlen) if qlen is not None else None
        except Exception:
            qlen = None
        return Candidate(
            username=username,
            filename=filename,
            size=size,
            ext_score=preferred_ext_score(filename, preferred_ext),
            reported_speed=speed if speed is None else float(speed),
            peer_queue_len=qlen,
        )

    def search_lossless(
        self,
        query: str,
        search_timeout_ms: int = 15000,
        response_limit: int = 60,
        min_upload_speed_bps: int = 0,
        max_peer_queue: int = 1_000_000,
        preferred_ext: Optional[str] = None,
        lossless_only: bool = True,
    ) -> List[Candidate]:
        """Run a slskd text search and return candidates, best first.

        If lossless_only is True, filter to lossless extensions; otherwise allow any.
        """
        preferred = (preferred_ext or self.preferred_ext).lower()
        resp = self.client.searches.search_text(  # type: ignore[attr-defined]
            searchText=query,
            fileLimit=10_000,
            filterResponses=True,
            maximumPeerQueueLength=max_peer_queue,
            minimumPeerUploadSpeed=min_upload_speed_bps,
            minimumResponseFileCount=1,
            responseLimit=response_limit,
            searchTimeout=search_timeout_ms,
        )
        sid = resp.get("id")
        if not sid:
            # Some versions may not return id; ask for all and use the latest as a fallback
            searches = self.client.searches.get_all()  # type: ignore[attr-defined]
            sid = searches[-1]["id"] if searches else None
        if not sid:
            return []
        results = self.client.searches.search_responses(sid)  # type: ignore[attr-defined]
        # responses are grouped by user -> files; flatten
        candidates: List[Candidate] = []
        for r in results:
            user = r.get("username") or r.get("user")
            files = r.get("files") or []
            for f in files:
                # decorate with username
                f = dict(f)
                f["username"] = user
                fname = f.get("filename") or f.get("file") or ""
                if not fname:
                    continue
                if lossless_only and not is_lossless_path(fname):
                    continue
                cand = self._normalize_resp(f, preferred)
                # If lossless_only, require ext_score>0; else accept any
                if lossless_only and cand.ext_score <= 0:
                    continue
                candidates.append(cand)
        # sort by score (ext, speed desc, queue asc)
        candidates.sort(key=lambda c: c.score(), reverse=True)
        return candidates

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    def enqueue_download(self, user: str, filename: str, size: int) -> bool:
        """Enqueue a download from a specific user and file."""
        files = [{"filename": filename, "size": size}]
        try:
            ok = self.client.transfers.enqueue(user, files)  # type: ignore[attr-defined]
        except Exception as e:
            raise RuntimeError(f"enqueue failed for {filename} from {user}: {e}")
        return bool(ok)

    def wait_for_completion(
        self, user: str, target_basename: str, timeout_s: float = 600.0, poll_s: float = 2.0
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """Poll transfers until a matching download finishes (or fails/timeout).

        We try to match by filename suffix because slskd provides the remote filename.
        """
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            # `get_downloads(user)` returns a dict keyed by id -> download info; sometimes list
            try:
                downloads = self.client.transfers.get_downloads(user)  # type: ignore[attr-defined]
            except Exception:
                downloads = self.client.transfers.get_all_downloads()  # type: ignore[attr-defined]
            # Normalize into iterable of dicts
            if isinstance(downloads, dict):
                iter_objs = downloads.values()
            else:
                iter_objs = downloads
            for d in iter_objs:
                name = d.get("filename") or d.get("file") or ""
                state = (d.get("state") or d.get("status") or "").lower()
                if target_basename and name.endswith(target_basename):
                    if state in {"complete", "completed", "finished", "success"}:
                        return True, d
                    if state in {"failed", "error", "cancelled"}:
                        return False, d
            time.sleep(poll_s)
        return False, None
            time.sleep(poll_s)
        return False, None
