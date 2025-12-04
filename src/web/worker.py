from __future__ import annotations

import threading
import uuid
import os
import shutil
import zipfile
from typing import Any, List

from src.spotify_client import Track, SpotifyClient
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
) -> str:
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
):
    job = JOBS[job_id]
    job.status = "running"
    
    try:
        # Setup clients
        # We need a custom auth manager that uses the token we got
        from spotipy.oauth2 import SpotifyOAuth
        # Re-construct auth manager to refresh if needed, or just use the token
        # For simplicity, let's assume the token is valid for the duration or we use a fresh client
        # Ideally we pass the token_info to SpotifyClient
        
        # Hack: Create a dummy auth manager or just pass the token to Spotify if we modify SpotifyClient further
        # But our modified SpotifyClient takes an auth_manager.
        # Let's use a custom one or just a raw Spotify object if we could.
        # Actually, spotipy.Spotify(auth=token) works if we have the access token string.
        
        sp_client = SpotifyClient(auth_manager=None) 
        # Wait, we need to inject the user auth. 
        # Let's modify SpotifyClient to accept a raw token or just bypass it here.
        import spotipy
        sp_client.sp = spotipy.Spotify(auth=token_info['access_token'])
        
        playlist_name, tracks = sp_client.get_playlist(playlist_id)
        job.playlist_name = playlist_name
        job.total_tracks = len(tracks)
        
        # Setup Soulseek
        slsk_client = SoulseekClient(host=slskd_host, api_key=slskd_api_key, preferred_ext=preferred_format)
        
        # Setup Downloader
        # We need a temporary output dir for this job
        output_dir = os.path.join("downloads", job_id)
        os.makedirs(output_dir, exist_ok=True)
        
        dl = Downloader(
            slsk=slsk_client,
            slskd_download_dir=slskd_download_dir,
            output_dir=output_dir,
            max_retries=8,
            preferred_ext=preferred_format,
            allow_lossy_fallback=allow_lossy_fallback,
        )
        
        def progress_cb(type_: str, data: Any):
            if type_ == "log":
                job.logs.append(data)
                # Keep logs trimmed if needed
                if len(job.logs) > 100:
                    job.logs.pop(0)
            elif type_ == "progress":
                job.current_track_index = data["current"]
                job.current_track_name = data["track"]
            elif type_ == "done":
                job.ok_count = data["ok"]
                job.fail_count = data["fail"]
        
        dl.run(playlist_name, tracks, progress_callback=progress_cb)
        
        # Zip the result
        zip_path = os.path.join("downloads", f"{job_id}.zip")
        _zip_directory(output_dir, zip_path)
        
        job.result_path = zip_path
        job.status = "completed"
        
        # Cleanup raw files
        shutil.rmtree(output_dir, ignore_errors=True)
        
    except Exception as e:
        job.status = "failed"
        job.logs.append(f"Error: {str(e)}")
        print(f"Job {job_id} failed: {e}")

def _zip_directory(folder_path, zip_path):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, folder_path)
                zipf.write(file_path, arcname)
