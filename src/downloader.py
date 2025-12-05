from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from typing import List, Optional, Tuple

from colorama import Fore, Style
from src.utils.formatting import basename_any, safe_filename, is_lossless_path
from src.utils.logging import setup_logger


@dataclass
class DownloadOutcome:
    track: Track
    success: bool
    message: str
    path: Optional[str] = None


class Downloader:
    """Coordinates track searches, ranking, retries and final saving."""

    def __init__(
        self,
        slsk: SoulseekClient,
        slskd_download_dir: str,
        output_dir: str,
        max_retries: int = 3,
        preferred_ext: str = "wav",
        allow_lossy_fallback: bool = False,
        dry_run: bool = False,
    ) -> None:
        self.slsk = slsk
        self.slskd_download_dir = slskd_download_dir
        self.output_dir = output_dir
        self.max_retries = max_retries
        self.preferred_ext = preferred_ext
        self.allow_lossy_fallback = allow_lossy_fallback
        self.dry_run = dry_run
        os.makedirs(self.output_dir, exist_ok=True)
        self.logger = setup_logger()

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

    def process_track(self, track: Track, progress_callback=None) -> DownloadOutcome:
        """Search best sources for a track and attempt download with retries."""
        display_name = f"{track.artist} - {track.title}"
        self._matrix_print(f"Searching: {display_name}", progress_callback)
        # Aggregate candidates across a couple queries
        seen = set()
        candidates: List[Candidate] = []
        for q in track.query_strings():
            self._matrix_print(f" · Query: {q}", progress_callback)
            cands = self.slsk.search_lossless(q, preferred_ext=self.preferred_ext)
            self._matrix_print(f"   ↳ {len(cands)} hits", progress_callback)
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
                return DownloadOutcome(track, False, msg)
            # Fallback: search any format
            for q in track.query_strings():
                self._matrix_print(f" · Query (lossy ok): {q}", progress_callback)
                cands = self.slsk.search_lossless(
                    q, preferred_ext=self.preferred_ext, lossless_only=False
                )
                self._matrix_print(f"   ↳ {len(cands)} hits", progress_callback)
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
                return DownloadOutcome(track, False, msg)
        # Try best -> worst, honour max_retries (per-track)
        tried = 0
        for cand in candidates:
            tried += 1
            if tried > self.max_retries:
                break
            self._matrix_print(" ↳ candidate: " + self._candidate_label(cand), progress_callback)
            if self.dry_run:
                return DownloadOutcome(track, True, "Dry-run (skipped download)")
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

            ok, meta = self.slsk.wait_for_completion(cand.username, base_remote, timeout_s=240.0, progress_cb=dl_progress)
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
                    self._matrix_print(f" ! candidate failed or timeout{reason}", progress_callback)
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
            final_name = safe_filename(f"{track.artist} - {track.title}{final_ext}" )
            dst_path = os.path.join(self.output_dir, final_name)
            os.makedirs(self.output_dir, exist_ok=True)
            try:
                shutil.move(src_guess, dst_path)
            except Exception:
                # Cross-device move?
                shutil.copy2(src_guess, dst_path)
                os.remove(src_guess)
            self._matrix_print(f" ✓ Saved {final_name}", progress_callback)
            return DownloadOutcome(track, True, "OK", path=dst_path)
        msg = "All candidates failed"
        self._matrix_print(" ! " + msg, progress_callback)
        return DownloadOutcome(track, False, msg)

    def run(self, playlist_name: str, tracks: List[Track], progress_callback=None) -> Tuple[int, int]:
        """Process all tracks. progress_callback(type, data) if provided."""
        ok = 0
        fail = 0
        total = len(tracks)
        
        # If running in CLI mode (no callback), we might want tqdm, but for now let's keep it simple
        # or we can inject a tqdm wrapper as the callback.
        
        for i, t in enumerate(tracks, start=1):
            if progress_callback:
                progress_callback("progress", {"current": i, "total": total, "track": t.title})

            outcome = self.process_track(t, progress_callback)

            if outcome.success:
                ok += 1
            else:
                fail += 1

            if progress_callback:
                progress_callback(
                    "track_done",
                    {
                        "current": i,
                        "total": total,
                        "track": t.title,
                        "ok": ok,
                        "fail": fail,
                        "success": outcome.success,
                        "message": outcome.message,
                    },
                )

        if progress_callback:
            progress_callback("done", {"ok": ok, "fail": fail})

        return ok, fail
