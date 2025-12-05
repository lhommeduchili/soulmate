from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests
from tenacity import retry, stop_after_attempt, wait_fixed

try:
    import slskd_api  # type: ignore
except Exception as e:  # pragma: no cover - import-time error shown at runtime
    slskd_api = None  # type: ignore

from src.utils.formatting import basename_any, is_lossless_path, preferred_ext_score


@dataclass
class Candidate:
    """Single search hit returned by slskd."""

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
        # Keep searches reasonable and avoid slskd rate limits.
        self._min_search_interval = 0.8  # seconds between calls to avoid slskd rate limit
        self._last_search_time = 0.0
        self.client = slskd_api.SlskdClient(  # type: ignore[attr-defined]
            host=host,
            api_key=api_key,
            username=username,
            password=password,
            verify_ssl=verify_ssl,
            timeout=timeout,
        )

    def _normalize_resp(self, r: Dict[str, Any], preferred_ext: str) -> Candidate:
        """Map a raw slskd response dict to a Candidate with computed ext score."""
        username = r.get("username") or r.get("user") or ""
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
        search_timeout_ms: int = 12000,
        response_limit: int = 60,
        min_upload_speed_bps: int = 0,
        max_peer_queue: int = 1_000_000,
        preferred_ext: Optional[str] = None,
        lossless_only: bool = True,
    ) -> List[Candidate]:
        """Run a slskd text search and return candidates, best first."""
        preferred = (preferred_ext or self.preferred_ext).lower()
        now = time.time()
        wait_for = self._min_search_interval - (now - self._last_search_time)
        if wait_for > 0:
            time.sleep(wait_for)
        self._last_search_time = time.time()

        attempts = 0
        results: List[Dict[str, Any]] = []
        sid: Optional[str] = None
        token: Optional[int] = None
        while attempts < 4:
            attempts += 1
            try:
                resp = self.client.searches.search_text(  # type: ignore[attr-defined]
                    searchText=query,
                    fileLimit=10_000,
                    filterResponses=False,
                    maximumPeerQueueLength=max_peer_queue,
                    minimumPeerUploadSpeed=min_upload_speed_bps,
                    minimumResponseFileCount=1,
                    responseLimit=response_limit,
                    searchTimeout=search_timeout_ms,
                )
            except requests.exceptions.HTTPError as e:
                status = e.response.status_code if e.response is not None else None
                text = str(e)
                if status in (409, 429) or "429" in text or "Too Many Requests" in text or "Conflict" in text:
                    time.sleep(1.0 * attempts)
                    continue
                raise
            except Exception as e:
                text = str(e)
                status = getattr(e, "status_code", None) or getattr(e, "status", None)
                if status == 429 or "429" in text or "Too Many Requests" in text:
                    time.sleep(1.0 * attempts)
                    continue
                raise

            sid = resp.get("id")
            token = resp.get("token")
            if not sid:
                searches = self.client.searches.get_all()  # type: ignore[attr-defined]
                sid = searches[-1]["id"] if searches else None
            if not sid:
                time.sleep(1.0 * attempts)
                continue

            deadline = time.time() + max(20.0, search_timeout_ms / 1000.0 + 10.0)
            while time.time() < deadline:
                params = {"token": token} if token is not None else {}
                try:
                    url = f"{self.client.searches.api_url}/searches/{sid}/responses"  # type: ignore[attr-defined]
                    batch = self.client.searches.session.get(url, params=params).json()  # type: ignore[attr-defined]
                except Exception:
                    batch = self.client.searches.search_responses(sid)  # type: ignore[attr-defined]
                if batch:
                    results.extend(batch)
                    if len(results) >= response_limit:
                        break
                time.sleep(0.5)
            if not results:
                params = {"token": token} if token is not None else {}
                try:
                    url = f"{self.client.searches.api_url}/searches/{sid}/responses"  # type: ignore[attr-defined]
                    results = self.client.searches.session.get(url, params=params).json()  # type: ignore[attr-defined]
                except Exception:
                    results = self.client.searches.search_responses(sid)  # type: ignore[attr-defined]

            if results:
                break

        if not sid or not results:
            return []

        candidates: List[Candidate] = []
        seen = set()
        for r in results:
            if not isinstance(r, dict):
                continue
            user = r.get("username") or r.get("user")
            files = r.get("files")
            if files is None:
                files = [r]
            for f in files or []:
                if not isinstance(f, dict):
                    continue
                f = dict(f)
                f["username"] = user or f.get("username") or f.get("user")
                fname = f.get("filename") or f.get("file") or f.get("path") or ""
                if not fname:
                    continue
                if lossless_only and not is_lossless_path(fname):
                    continue
                cand = self._normalize_resp(f, preferred)
                key = (cand.username, cand.filename)
                if key in seen:
                    continue
                seen.add(key)
                candidates.append(cand)
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
        self,
        user: str,
        target_basename: str,
        timeout_s: float = 90.0,
        poll_s: float = 2.0,
        progress_cb=None,
        file_finder: Optional[Callable[[], Optional[str]]] = None,
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """Poll transfers until a matching download finishes (or fails/timeout)."""
        deadline = time.time() + timeout_s
        target = basename_any(target_basename)
        target_lower = target.lower()
        last_state = None
        last_percent = -1.0
        while time.time() < deadline:
            if file_finder:
                found = file_finder()
                if found:
                    if progress_cb and (last_state != "complete" or last_percent < 100.0):
                        progress_cb("complete", 100.0)
                    return True, {"filename": found, "state": "complete"}
            try:
                downloads = self.client.transfers.get_downloads(user)  # type: ignore[attr-defined]
            except Exception:
                downloads = self.client.transfers.get_all_downloads()  # type: ignore[attr-defined]
            if isinstance(downloads, dict):
                iter_objs = downloads.values()
            else:
                iter_objs = downloads
            for d in iter_objs:
                if not isinstance(d, dict):
                    continue
                name = d.get("filename") or d.get("file") or ""
                state = (d.get("state") or d.get("status") or "").lower()
                normalized = basename_any(name)
                normalized_lower = normalized.lower()
                transferred = d.get("transferredBytes") or d.get("bytesTransferred") or d.get("transferred") or 0
                try:
                    transferred = int(transferred)
                except Exception:
                    transferred = 0
                size = d.get("size") or d.get("filesize") or 0
                try:
                    size = int(size)
                except Exception:
                    size = 0
                percent = (transferred / size * 100) if size else 0.0
                if progress_cb and (
                    normalized_lower == target_lower or normalized_lower.endswith(target_lower) or name.replace("\\", "/").lower().endswith(target_lower)
                ):
                    if state != last_state or percent - last_percent >= 1.0:
                        progress_cb(state or "running", percent)
                        last_state = state
                        last_percent = percent
                if target and (normalized_lower == target_lower or name.replace("\\", "/").lower().endswith(target_lower)):
                    if state in {"complete", "completed", "finished", "success"}:
                        return True, d
                    if state in {"failed", "error", "cancelled", "blocked", "denied", "banned"}:
                        return False, d
                    reason = (d.get("failureReason") or d.get("reason") or "").lower()
                    if reason and any(word in reason for word in ["denied", "blocked", "banned"]):
                        return False, d
            time.sleep(poll_s)
        if file_finder:
            found = file_finder()
            if found:
                if progress_cb and (last_state != "complete" or last_percent < 100.0):
                    progress_cb("complete", 100.0)
                return True, {"filename": found, "state": "complete"}
        return False, None
