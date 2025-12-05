from __future__ import annotations

import os
import shutil
import threading
import uuid
from typing import Any, List, Optional, Tuple

from src.spotify_client import SpotifyClient
from src.soulseek_client import SoulseekClient
from src.downloader import Downloader
from src.web.state import JOBS, JobState

def start_download_job(
    token_info: dict,
    playlist_id: str,
    slskd_host: str,
    slskd_api_key: str,
    slskd_download_dir: str,
    preferred_format: str = "wav",
    allow_lossy_fallback: bool = True,
    track_limit: Optional[int] = None,
) -> str:
    """Bootstrap a background download job and return its job_id."""
    job_id = str(uuid.uuid4())
    
    # Initialize job state
    JOBS[job_id] = JobState(
        id=job_id,
        status="pending",
        playlist_name="Initializing...",
        total_tracks=0,
        current_track_index=0,
        current_track_name="",
        ok_count=0,
        fail_count=0,
    )

    # Run in a separate thread
    t = threading.Thread(
        target=_download_worker,
        args=(
            job_id,
            token_info,
            playlist_id,
            slskd_host,
            slskd_api_key,
            slskd_download_dir,
            preferred_format,
            allow_lossy_fallback,
            track_limit,
        ),
        daemon=True
    )
    t.start()
    
    return job_id

def _download_worker(
    job_id: str,
    token_info: dict,
    playlist_id: str,
    slskd_host: str,
    slskd_api_key: str,
    slskd_download_dir: str,
    preferred_format: str,
    allow_lossy_fallback: bool,
    track_limit: Optional[int],
):
    """Background thread: fetch playlist, search on slskd, download, zip, update JOBS."""
    job = JOBS[job_id]
    job.status = "running"
    job.logs.append(f"Job {job_id} started · format={preferred_format} · lossy_ok={allow_lossy_fallback}")
    
    try:
        sp_client, token_info = _build_spotify_client(token_info)

        playlist_name, tracks = sp_client.get_playlist(playlist_id)
        if track_limit:
            tracks = tracks[:track_limit]
            job.logs.append(f"Track limit applied: first {len(tracks)} tracks")
        job.playlist_name = playlist_name
        job.total_tracks = len(tracks)
        job.logs.append(f"Playlist: {playlist_name} ({job.total_tracks} tracks queued)")
        
        slsk_client = SoulseekClient(host=slskd_host, api_key=slskd_api_key, preferred_ext=preferred_format)
        
        output_root = os.getenv("OUTPUT_ROOT", "downloads")
        os.makedirs(output_root, exist_ok=True)
        output_dir = os.path.join(output_root, job_id)
        os.makedirs(output_dir, exist_ok=True)
        
        concurrency_env = 0
        try:
            concurrency_env = int(os.getenv("DOWNLOADER_CONCURRENCY", "0") or 0)
        except Exception:
            concurrency_env = 0

        dl = Downloader(
            slsk=slsk_client,
            slskd_download_dir=slskd_download_dir,
            output_dir=output_dir,
            max_retries=3,
            preferred_ext=preferred_format,
            allow_lossy_fallback=allow_lossy_fallback,
            concurrency=concurrency_env if concurrency_env > 0 else None,
        )
        
        def progress_cb(type_: str, data: Any):
            if type_ == "log":
                job.logs.append(data)
                if len(job.logs) > 200:
                    job.logs.pop(0)
            elif type_ == "progress":
                job.current_track_index = data["current"]
                job.current_track_name = data["track"]
                job.current_download_percent = 0.0
                job.current_download_state = ""
            elif type_ == "track_done":
                job.ok_count = data["ok"]
                job.fail_count = data["fail"]
                job.processed_tracks = data["current"]
                # Update file list incrementally
                collected = []
                for root, _, files in os.walk(output_dir):
                    for file in files:
                        abs_path = os.path.join(root, file)
                        rel_path = os.path.relpath(abs_path, output_root)
                        collected.append(rel_path)
                job.files = sorted(collected)
            elif type_ == "done":
                job.ok_count = data["ok"]
                job.fail_count = data["fail"]
                job.processed_tracks = job.total_tracks
                job.current_download_percent = 0.0
                job.current_download_state = ""
            elif type_ == "download_progress":
                job.current_download_percent = data.get("percent", 0.0)
                job.current_download_state = data.get("state", "")
        
        def pause_handler():
            """Block if job status is 'paused'."""
            import time
            while True:
                # Refresh job state from global dict
                current_status = JOBS[job_id].status
                if current_status == "paused":
                    time.sleep(1)
                    continue
                # If cancelled or failed, we might want to stop, but for now just let it proceed 
                # (or let the main loop handle it if we added cancellation support)
                break

        dl.run(playlist_name, tracks, progress_callback=progress_cb, pause_handler=pause_handler)
        
        # Collect files for direct download (no zip)
        collected = []
        for root, _, files in os.walk(output_dir):
            for file in files:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, output_root)
                collected.append(rel_path)
        job.files = sorted(collected)
        job.result_path = output_dir
        job.status = "completed"
        
    except Exception as e:
        job.status = "failed"
        job.logs.append(f"Error: {str(e)}")
        print(f"Job {job_id} failed: {e}")


def _build_spotify_client(token_info: dict) -> Tuple[SpotifyClient, dict]:
    """Create a SpotifyClient that can refresh the token_info if expired."""
    from spotipy.oauth2 import SpotifyOAuth

    client_id = os.getenv("SPOTIPY_CLIENT_ID")
    client_secret = os.getenv("SPOTIPY_CLIENT_SECRET")
    redirect_uri = os.getenv("SPOTIPY_REDIRECT_URI")
    if not client_id or not client_secret:
        raise RuntimeError("Spotify credentials missing on server")

    auth_manager = SpotifyOAuth(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        scope="user-library-read playlist-read-private",
        cache_handler=None,
    )
    refreshed = token_info
    try:
        if auth_manager.is_token_expired(token_info):
            refresh_token = token_info.get("refresh_token")
            if not refresh_token:
                raise RuntimeError("Spotify token expired and no refresh_token available")
            refreshed = auth_manager.refresh_access_token(refresh_token)
    except Exception as exc:
        raise RuntimeError(f"Failed to refresh Spotify token: {exc}") from exc

    client = SpotifyClient(access_token=refreshed["access_token"])
    return client, refreshed

def _zip_directory(folder_path, zip_path):
    """Zip a whole folder preserving relative paths."""
    # Deprecated: zipping disabled in favor of direct file download
    raise RuntimeError("Zipping disabled; use direct file downloads.")
