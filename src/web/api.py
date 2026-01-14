import os
import secrets
import time
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, Response
from fastapi.responses import RedirectResponse, FileResponse
from spotipy.oauth2 import SpotifyOAuth
import shutil
import tempfile
import zipfile

from src.web.state import JOBS
from src.web.worker import start_download_job
from src.spotify_client import Track, SpotifyClient
from src.soulseek_client import SoulseekClient, Candidate
from src.utils.formatting import DEFAULT_FORMAT_PREFERENCE, basename_any, is_lossless_path, normalize_format_preference, safe_filename
from src.web.session import (
    SESSION_COOKIE_NAME,
    SessionData,
    create_session,
    destroy_session,
    get_session,
    refresh_session_if_needed,
)

ALLOWED_FORMATS = {"aiff", "wav", "flac", "lossy"}

router = APIRouter(prefix="/api")

def _active_job_count() -> int:
    return sum(1 for j in JOBS.values() if j.status in {"pending", "running", "paused"})

_OAUTH_STATES: Dict[str, float] = {}
_STATE_TTL_SECONDS = 300

from src.web.cache import NoCacheHandler

def get_spotify_oauth(show_dialog=False):
    return SpotifyOAuth(
        client_id=os.getenv("SPOTIPY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
        scope="user-library-read playlist-read-private",
        cache_handler=NoCacheHandler(),
        show_dialog=show_dialog
    )

def _create_oauth_state() -> str:
    token = secrets.token_urlsafe(24)
    _OAUTH_STATES[token] = time.time()
    # prune old
    stale_before = time.time() - _STATE_TTL_SECONDS
    for k, v in list(_OAUTH_STATES.items()):
        if v < stale_before:
            _OAUTH_STATES.pop(k, None)
    return token

def _validate_oauth_state(state: Optional[str]) -> None:
    if not state:
        raise HTTPException(status_code=400, detail="Falta parámetro state en OAuth")
    ts = _OAUTH_STATES.pop(state, None)
    if ts is None or (time.time() - ts) > _STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="Parámetro state inválido o expirado")

def _require_session(request: Request) -> SessionData:
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    session = get_session(session_id)
    return refresh_session_if_needed(session)

@router.get("/auth/login")
def login(request: Request):
    sp_oauth = get_spotify_oauth(show_dialog=True)
    state = _create_oauth_state()
    auth_url = sp_oauth.get_authorize_url(state=state)
    return {"url": auth_url}

@router.get("/auth/callback")
def callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        # User cancelled or access denied
        return RedirectResponse(url="/login?info=cancelled", status_code=302)
    if not code:
        return RedirectResponse(url="/login?error=no_code", status_code=302)
        
    try:
        _validate_oauth_state(state)
        sp_oauth = get_spotify_oauth()
        token_info = sp_oauth.get_access_token(code)

        session = create_session(token_info)
        cookie_secure = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
        cookie_samesite = os.getenv("SESSION_SAMESITE", "lax")
        redirect = RedirectResponse(url="/", status_code=302)
        redirect.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session.session_id,
            httponly=True,
            secure=cookie_secure,
            samesite=cookie_samesite,
        )
        return redirect
    except Exception as e:
        import traceback
        traceback.print_exc()
        # Return to login with error
        return RedirectResponse(
            url=f"/login?error={str(e)}",
            status_code=302
        )

@router.post("/auth/logout")
def logout(request: Request):
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    destroy_session(session_id)
    redirect = RedirectResponse(url="/login", status_code=302)
    redirect.delete_cookie(SESSION_COOKIE_NAME)
    return redirect


@router.get("/auth/me")
def auth_me(session: SessionData = Depends(_require_session)):
    return {"user_id": session.spotify_user_id, "display_name": session.display_name, "app_user": "spotify_only"}

@router.get("/playlists")
def get_playlists(session: SessionData = Depends(_require_session)):
    # Use the token to get playlists
    import spotipy
    token_info = refresh_session_if_needed(session).token_info
    sp = spotipy.Spotify(auth=token_info["access_token"])
    
    playlists = []
    try:
        results = sp.current_user_playlists(limit=30)
        while True:
            for item in results['items']:
                if item: # Check if item is not None
                    playlists.append({
                        "id": item['id'],
                        "name": item['name'],
                        "tracks": item['tracks']['total'],
                        "image": item['images'][0]['url'] if item['images'] else None
                    })
            if results.get("next"):
                results = sp.next(results)
            else:
                break
        return playlists
    except Exception as e:
        print(f"Error fetching playlists: {e}")
        raise HTTPException(status_code=401, detail="Failed to fetch playlists (token might be expired)")

from pydantic import BaseModel

class DownloadRequest(BaseModel):
    playlist_id: str
    preferred_format: Optional[str] = None
    format_preferences: Optional[List[str]] = None
    allow_lossy_fallback: bool = True
    track_limit: Optional[int] = None



@router.post("/start_download")
def start_download(req: DownloadRequest, session: SessionData = Depends(_require_session)):
    from src.web.state import MAX_CONCURRENT_JOBS
    from src.web.worker import start_download_job

    if _active_job_count() >= MAX_CONCURRENT_JOBS:
        raise HTTPException(status_code=429, detail="Límite de sesiones concurrentes alcanzado. Intenta más tarde.")
    token_info = refresh_session_if_needed(session).token_info
    submitted_formats: List[str] = []
    if req.format_preferences:
        submitted_formats = req.format_preferences
    elif req.preferred_format:
        submitted_formats = [req.preferred_format]

    invalid = [f for f in submitted_formats if f and str(f).lower().lstrip(".") not in ALLOWED_FORMATS]
    if invalid:
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa aiff, flac, wav o lossy.")

    format_preferences = normalize_format_preference(submitted_formats or None)
    if req.allow_lossy_fallback:
        if "lossy" not in format_preferences:
            format_preferences.append("lossy")
    else:
        format_preferences = [p for p in format_preferences if p != "lossy"]
    track_limit = req.track_limit
    if track_limit is not None and track_limit <= 0:
        track_limit = None
    if track_limit is None or track_limit > 50:
        track_limit = 50
    
    slskd_host = os.getenv("SLSKD_HOST")
    slskd_api_key = os.getenv("SLSKD_API_KEY")
    slskd_download_dir = os.getenv("SLSKD_DOWNLOAD_DIR")
    
    if not slskd_host or not slskd_api_key or not slskd_download_dir:
        raise HTTPException(status_code=500, detail="Server misconfigured (missing Slskd config)")
        
    job_id = start_download_job(
        token_info=token_info,
        playlist_id=req.playlist_id,
        slskd_host=slskd_host,
        slskd_api_key=slskd_api_key,
        slskd_download_dir=slskd_download_dir,
        format_preferences=format_preferences,
        allow_lossy_fallback=req.allow_lossy_fallback,
        track_limit=track_limit,
        owner_id=session.spotify_user_id,
        owner_name=session.display_name,
    )
    return {"job_id": job_id}

def _get_owned_job(job_id: str, session: SessionData) -> Any:
    from src.web.state import JOBS
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id and job.owner_id != session.spotify_user_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este job")
    return job

@router.get("/jobs/{job_id}")
def get_job(job_id: str, session: SessionData = Depends(_require_session)):
    job = _get_owned_job(job_id, session)
    payload = job.__dict__.copy()
    payload["pending_count"] = len(getattr(job, "pending_files", []) or [])
    return payload

@router.get("/jobs/{job_id}/download")
def download_job_result(job_id: str, session: SessionData = Depends(_require_session)):
    _get_owned_job(job_id, session)
    raise HTTPException(status_code=400, detail="Direct downloads only; access files under /downloads/")


@router.get("/jobs/{job_id}/files")
def list_job_files(job_id: str, session: SessionData = Depends(_require_session)):
    job = _get_owned_job(job_id, session)
    return {"files": job.files}


@router.get("/jobs/{job_id}/files/{file_path:path}")
def download_job_file(job_id: str, file_path: str, session: SessionData = Depends(_require_session)):
    job = _get_owned_job(job_id, session)
    if job.status != "completed":
        raise HTTPException(status_code=400, detail="Job not ready")
    output_root = os.getenv("OUTPUT_ROOT", "downloads")
    # Prevent path traversal
    safe_root = os.path.abspath(output_root)
    full_path = os.path.abspath(os.path.join(output_root, file_path))
    if not full_path.startswith(safe_root):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    filename = os.path.basename(full_path)
    return FileResponse(full_path, media_type="application/octet-stream", filename=filename)


@router.get("/jobs/{job_id}/next_file")
def stream_next_file(
    job_id: str,
    background_tasks: BackgroundTasks,
    session: SessionData = Depends(_require_session),
):
    """Serve the next pending file for this job and delete it on the server after sending."""
    job = _get_owned_job(job_id, session)
    pending = getattr(job, "pending_files", [])
    if not pending:
        return Response(status_code=204)
    rel_path = pending.pop(0)
    output_root = os.getenv("OUTPUT_ROOT", "downloads")
    safe_root = os.path.abspath(output_root)
    full_path = os.path.abspath(os.path.join(output_root, rel_path))
    if not full_path.startswith(safe_root):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not os.path.exists(full_path):
        job.served_files.add(rel_path)
        raise HTTPException(status_code=404, detail="File not found on disk")

    job.served_files.add(rel_path)
    job.pending_files = pending
    # remove from files list if present
    if rel_path in job.files:
        job.files.remove(rel_path)

    def _cleanup():
        try:
            os.remove(full_path)
            # Optionally prune empty dirs
            dir_path = os.path.dirname(full_path)
            while dir_path.startswith(safe_root):
                if not os.listdir(dir_path):
                    os.rmdir(dir_path)
                    dir_path = os.path.dirname(dir_path)
                else:
                    break
        except Exception:
            pass

    background_tasks.add_task(_cleanup)
    filename = os.path.basename(full_path)
    return FileResponse(
        full_path,
        media_type="application/octet-stream",
        filename=filename,
        background=background_tasks,
    )


@router.get("/jobs/{job_id}/file_by_index/{index}")
def download_job_file_by_index(
    job_id: str,
    index: int,
    background_tasks: BackgroundTasks,
    session: SessionData = Depends(_require_session),
):
    """Download a file by its index in the job.files list to avoid path encoding issues."""
    job = _get_owned_job(job_id, session)
    if not job.files:
        raise HTTPException(status_code=404, detail="No files in job")
    
    try:
        rel_path = job.files[index]
    except IndexError:
        raise HTTPException(status_code=404, detail="File index out of range")

    output_root = os.getenv("OUTPUT_ROOT", "downloads")
    full_path = os.path.abspath(os.path.join(output_root, rel_path))
    safe_root = os.path.abspath(output_root)
    
    if not full_path.startswith(safe_root):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Update job state to reflect retrieval
    job.served_files.add(rel_path)
    if rel_path in job.files:
        job.files.remove(rel_path)
    if rel_path in getattr(job, "pending_files", []):
        job.pending_files.remove(rel_path)

    def _cleanup():
        try:
            os.remove(full_path)
            dir_path = os.path.dirname(full_path)
            while dir_path.startswith(safe_root):
                if not os.listdir(dir_path):
                    os.rmdir(dir_path)
                    dir_path = os.path.dirname(dir_path)
                else:
                    break
        except Exception:
            pass

    background_tasks.add_task(_cleanup)

    filename = os.path.basename(full_path)
    return FileResponse(full_path, media_type="application/octet-stream", filename=filename, background=background_tasks)


@router.post("/jobs/{job_id}/pause")
def pause_job(job_id: str, session: SessionData = Depends(_require_session)):
    job = _get_owned_job(job_id, session)
    if job.status == "running":
        job.status = "paused"
        job.logs.append("Job paused by user.")
    return {"status": job.status}

@router.post("/jobs/{job_id}/resume")
def resume_job(job_id: str, session: SessionData = Depends(_require_session)):
    job = _get_owned_job(job_id, session)
    if job.status == "paused":
        job.status = "running"
        job.logs.append("Job resumed.")
    return {"status": job.status}

@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, session: SessionData = Depends(_require_session)):
    """Cancel a job and remove its downloaded files on the server."""
    job = _get_owned_job(job_id, session)
    job.status = "cancelled"
    job.logs.append("Job cancelled by user; cleaning up files.")
    output_root = os.getenv("OUTPUT_ROOT", "downloads")
    job_dir = os.path.join(output_root, job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)
    job.files = []
    job.pending_files = []
    job.served_files = set()
    return {"status": job.status}


