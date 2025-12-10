from __future__ import annotations

import os
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Optional, Tuple

from colorama import Fore, Style
from src.utils.formatting import basename_any, is_lossless_path, normalize_format_preference, safe_filename
from src.utils.logging import setup_logger


@dataclass
class DownloadOutcome:
    track: Track
    success: bool
    message: str
    path: Optional[str] = None
    queries: List[str] = None
    candidates: List[str] = None
    search_results: List[dict] = None


class Downloader:
    """Coordinates track searches, ranking, retries and final saving."""

    def __init__(
        self,
        slsk: SoulseekClient,
        slskd_download_dir: str,
        output_dir: str,
        max_retries: int = 3,
        preferred_ext: Optional[str] = None,
        format_preferences: Optional[List[str]] = None,
        allow_lossy_fallback: bool = False,
        dry_run: bool = False,
        concurrency: Optional[int] = None,
    ) -> None:
        self.slsk = slsk
        self.slskd_download_dir = slskd_download_dir
        self.output_dir = output_dir
        self.max_retries = max_retries
        prefs = normalize_format_preference(format_preferences or preferred_ext)
        if allow_lossy_fallback and "lossy" not in prefs:
            prefs = prefs + ["lossy"]
        if not allow_lossy_fallback:
            prefs = [p for p in prefs if p != "lossy"]
        self.format_preferences = prefs
        self.preferred_ext = self.format_preferences[0] if self.format_preferences else None
        self.allow_lossy_fallback = allow_lossy_fallback
        self.dry_run = dry_run
        # None = default to a safe parallelism (set below).
        self.concurrency = concurrency
        os.makedirs(self.output_dir, exist_ok=True)
        self.logger = setup_logger()
        self._search_lock = threading.Lock()

    def _matrix_print(self, msg: str, progress_callback=None) -> None:
        """Send progress to callback (web UI) or stdout (CLI)."""
        if progress_callback:
            progress_callback("log", msg)
        else:
            print(Fore.GREEN + msg + Style.RESET_ALL)

    def _candidate_label(self, c: Candidate) -> str:
        """Human label for a candidate: user, queue, speed, basename."""
        spd = f"{c.reported_speed/1024:.0f} KiB/s" if c.reported_speed else "?"
        q = c.peer_queue_len if c.peer_queue_len is not None else "?"
        return f"{c.username} | q={q} | v={spd} | {basename_any(c.filename)}"

    def _find_downloaded_file(self, base_remote: str) -> Optional[str]:
        """Look for a downloaded file in the slskd directory even if slskd did not report completion."""
        direct = os.path.join(self.slskd_download_dir, base_remote)
        if os.path.exists(direct):
            return direct
        for root, _, files in os.walk(self.slskd_download_dir):
            for f in files:
                if f == base_remote:
                    return os.path.join(root, f)
        return None

    def _cleanup_empty_dirs(self, base_dir: str, path: str) -> None:
        """Remove empty parent directories up to base_dir (non-destructive if not empty)."""
        try:
            current = os.path.dirname(path)
            base_dir = os.path.abspath(base_dir)
            while current.startswith(base_dir):
                if not os.listdir(current):
                    os.rmdir(current)
                    current = os.path.dirname(current)
                else:
                    break
        except Exception:
            # Best effort; ignore failures
            pass

    def process_track(self, track: Track, progress_callback=None) -> DownloadOutcome:
        """Search best sources for a track and attempt download with retries."""
        display_name = f"{track.artist} - {track.title}"
        self._matrix_print(f"Searching: {display_name}", progress_callback)
        queries = list(track.query_strings())
        search_results: List[dict] = []
        # Aggregate candidates across a couple queries
        seen = set()
        candidates: List[Candidate] = []
        for q in queries:
            self._matrix_print(f" · Query: {q}", progress_callback)
            # Serialize searches to avoid slskd rate limits when running in parallel.
            with self._search_lock:
                cands = self.slsk.search_lossless(q, format_preferences=self.format_preferences)
            self._matrix_print(f"   ↳ {len(cands)} hits", progress_callback)
            search_results.append({"query": q, "hits": len(cands), "lossless_only": True})
            for preview in cands[:5]:
                self._matrix_print("     · " + self._candidate_label(preview), progress_callback)
            for c in cands:
                key = (c.username, c.filename)
                if key not in seen:
                    candidates.append(c)
                    seen.add(key)
        if not candidates:
            if not self.allow_lossy_fallback:
                msg = "No lossless sources found"
                self._matrix_print(f" ! {msg}", progress_callback)
                return DownloadOutcome(track, False, msg, queries=queries, candidates=[], search_results=search_results)
            # Fallback: search any format
            for q in queries:
                self._matrix_print(f" · Query (lossy ok): {q}", progress_callback)
                with self._search_lock:
                    cands = self.slsk.search_lossless(
                        q, format_preferences=self.format_preferences, lossless_only=False
                    )
                self._matrix_print(f"   ↳ {len(cands)} hits", progress_callback)
                search_results.append({"query": q, "hits": len(cands), "lossless_only": False})
                for preview in cands[:5]:
                    self._matrix_print("     · " + self._candidate_label(preview), progress_callback)
                for c in cands:
                    key = (c.username, c.filename)
                    if key not in seen:
                        candidates.append(c)
                        seen.add(key)
            if not candidates:
                msg = "No sources found (even lossy)"
                self._matrix_print(f" ! {msg}", progress_callback)
                return DownloadOutcome(track, False, msg, queries=queries, candidates=[], search_results=search_results)
        # Try best -> worst, honour max_retries (per-track)
        candidates.sort(key=lambda c: c.score(), reverse=True)
        tried = 0
        tried_labels: List[str] = []
        for cand in candidates:
            tried += 1
            if tried > self.max_retries:
                break
            self._matrix_print(" ↳ candidate: " + self._candidate_label(cand), progress_callback)
            tried_labels.append(self._candidate_label(cand))
            if self.dry_run:
                return DownloadOutcome(track, True, "Dry-run (skipped download)", queries=queries, candidates=tried_labels)
            try:
                ok = self.slsk.enqueue_download(cand.username, cand.filename, cand.size)
                if not ok:
                    msg = "Enqueue returned False (slskd rejected)"
                    self._matrix_print(" ! " + msg, progress_callback)
                    self.logger.warning(msg)
                    continue
            except Exception as e:
                msg = f"Enqueue failed: {e}"
                self._matrix_print(" ! " + msg, progress_callback)
                self.logger.warning(msg)
                continue
            base_remote = basename_any(cand.filename)
            self._matrix_print("   waiting for download...", progress_callback)

            def dl_progress(state: str, percent: float) -> None:
                if progress_callback:
                    progress_callback(
                        "download_progress",
                        {
                            "track": track.title,
                            "state": state,
                            "percent": round(percent, 1),
                        },
                    )

            ok, meta = self.slsk.wait_for_completion(
                cand.username,
                base_remote,
                timeout_s=120.0,
                progress_cb=dl_progress,
                file_finder=lambda: self._find_downloaded_file(base_remote),
            )
            if not ok:
                # Check if the file exists even if slskd didn't report completion (some peers block state updates)
                found = self._find_downloaded_file(base_remote)
                if found:
                    self._matrix_print(" ! slskd didn't confirm but file is present; accepting", progress_callback)
                    src_guess = found
                    ok = True
                else:
                    reason = ""
                    if meta:
                        failure = meta.get("failureReason") or meta.get("reason") or meta.get("error") or meta.get("status")
                        if failure:
                            reason = f" ({failure})"
                    fail_msg = f"candidate failed or timeout{reason}"
                    self._matrix_print(f" ! {fail_msg}", progress_callback)
                    self.logger.info("candidate failed or timeout; trying next...")
                    continue
            else:
                # Move/rename into output
                src_guess = self._find_downloaded_file(base_remote) or os.path.join(self.slskd_download_dir, base_remote)
            if not os.path.exists(src_guess):
                return DownloadOutcome(track, False, "Downloaded file not found in slskd directory")
            # Final name
            final_ext = os.path.splitext(src_guess)[1]
            if not is_lossless_path(src_guess):
                if not self.allow_lossy_fallback:
                    return DownloadOutcome(track, False, f"Downloaded file not lossless: {final_ext}")
                # Accept lossy when explicitly allowed
                self.logger.info("Accepting lossy download because fallback is enabled")
            final_name = safe_filename(f"{track.artist} - {track.title}{final_ext}")
            dst_path = os.path.join(self.output_dir, final_name)
            counter = 2
            while os.path.exists(dst_path):
                alt_name = safe_filename(f"{track.artist} - {track.title} ({counter}){final_ext}")
                dst_path = os.path.join(self.output_dir, alt_name)
                counter += 1
            os.makedirs(self.output_dir, exist_ok=True)
            try:
                shutil.move(src_guess, dst_path)
            except Exception:
                # Cross-device move?
                shutil.copy2(src_guess, dst_path)
                os.remove(src_guess)
            # Clean empty album folders left in slskd download dir
            self._cleanup_empty_dirs(self.slskd_download_dir, src_guess)
            self._matrix_print(f" ✓ Saved {final_name}", progress_callback)
            return DownloadOutcome(
                track, True, "OK", path=dst_path, queries=queries, candidates=tried_labels, search_results=search_results
            )
        msg = f"All candidates failed after {len(tried_labels)} tries"
        self._matrix_print(" ! " + msg, progress_callback)
        return DownloadOutcome(track, False, msg, queries=queries, candidates=tried_labels, search_results=search_results)

    def run(self, playlist_name: str, tracks: List[Track], progress_callback=None, pause_handler=None) -> Tuple[int, int]:
        """Process all tracks (optionally in parallel). progress_callback(type, data) if provided."""
        total = len(tracks)
        # Default to sequential to keep status/logs consistent unless a cap was provided.
        pool_size = self.concurrency if self.concurrency and self.concurrency > 0 else 1

        lock = threading.Lock()
        counters = {"ok": 0, "fail": 0}

        def safe_cb(type_: str, data):
            if progress_callback:
                with lock:
                    progress_callback(type_, data)

        def worker(i: int, t: Track):
            if pause_handler:
                pause_handler()
            safe_cb("progress", {"current": i, "total": total, "track": t.title})
            outcome = self.process_track(t, progress_callback=safe_cb)
            with lock:
                if outcome.success:
                    counters["ok"] += 1
                else:
                    counters["fail"] += 1
                ok_now = counters["ok"]
                fail_now = counters["fail"]
            safe_cb(
                "track_done",
                {
                    "current": i,
                    "total": total,
                    "track": t.title,
                    "artist": getattr(t, "artist", ""),
                    "album": getattr(t, "album", ""),
                    "ok": ok_now,
                    "fail": fail_now,
                    "success": outcome.success,
                    "message": outcome.message,
                    "queries": outcome.queries or [],
                    "candidates": outcome.candidates or [],
                    "search_results": outcome.search_results or [],
                    "path": outcome.path,
                },
            )

        with ThreadPoolExecutor(max_workers=pool_size) as executor:
            futures = [executor.submit(worker, i, t) for i, t in enumerate(tracks, start=1)]
            # Ensure all tasks complete; exceptions will be raised here.
            for f in as_completed(futures):
                f.result()

        safe_cb("done", {"ok": counters["ok"], "fail": counters["fail"]})
        return counters["ok"], counters["fail"]
