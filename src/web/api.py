import os
import json
import base64
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Request, Header, BackgroundTasks
from fastapi.responses import RedirectResponse, FileResponse
from spotipy.oauth2 import SpotifyOAuth
from urllib.parse import quote
import shutil
import tempfile
import zipfile

from src.web.state import JOBS
from src.web.worker import start_download_job
from src.spotify_client import Track, SpotifyClient
from src.soulseek_client import SoulseekClient, Candidate
from src.utils.formatting import basename_any, safe_filename, is_lossless_path

ALLOWED_FORMATS = {"wav", "flac", "aiff"}

router = APIRouter(prefix="/api")

def get_spotify_oauth():
    return SpotifyOAuth(
        client_id=os.getenv("SPOTIPY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
        redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
        scope="user-library-read playlist-read-private",
        cache_handler=None # We handle token manually
    )

# Dependency to get token from header
async def get_current_user_token(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        
        # In a real app, we would validate/decode a JWT here.
        # Since we are passing the raw Spotify token info object as the "token" (base64 encoded by frontend? no, let's keep it simple)
        # Actually, let's expect the frontend to send the ACCESS TOKEN directly as Bearer.
        # But we need the refresh token too? 
        # For simplicity, let's assume the frontend sends the whole token_info JSON as a base64 string in the header? 
        # No, standard is Bearer <access_token>.
        # BUT, the worker needs the refresh token to keep working in background.
        # So, let's have the frontend send the access token, but we might need to rethink how the worker gets auth.
        # Wait, the worker runs in background. It needs the token_info passed to it when starting the job.
        # So the frontend must send the full token_info to the start_download endpoint.
        
        # Let's change the strategy slightly:
        # Frontend sends "Authorization: Bearer <access_token>" for simple reads.
        # For "start_download", frontend sends the FULL token_info in the body.
        
        # ACTUALLY, to keep it simple and consistent:
        # Let's have the frontend send the access_token as Bearer.
        # For `start_download`, we will require the frontend to pass the full token object in the JSON body.
        
        return {"access_token": token}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authorization header")


@router.get("/auth/login")
def login(request: Request):
    sp_oauth = get_spotify_oauth()
    auth_url = sp_oauth.get_authorize_url()
    return {"url": auth_url}

@router.get("/auth/callback")
def callback(request: Request, code: str):
    try:
        print(f"DEBUG: Callback received with code: {code[:10]}...")
        sp_oauth = get_spotify_oauth()
        token_info = sp_oauth.get_access_token(code)
        
        # Encode token_info to base64 to pass safely in URL
        token_json = json.dumps(token_info)
        # URL-encode so characters like "+" and "=" survive the redirect querystring
        token_b64 = quote(base64.b64encode(token_json.encode()).decode())
        
        print("DEBUG: Redirecting to frontend with auth_data")
        # Redirect to frontend with token
        return RedirectResponse(url=f"/?auth_data={token_b64}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": "Login failed", "details": str(e), "type": type(e).__name__}

@router.get("/playlists")
def get_playlists(token_data: Dict = Depends(get_current_user_token)):
    # Use the token to get playlists
    import spotipy
    sp = spotipy.Spotify(auth=token_data['access_token'])
    
    playlists = []
    try:
        results = sp.current_user_playlists(limit=50)
        for item in results['items']:
            if item: # Check if item is not None
                playlists.append({
                    "id": item['id'],
                    "name": item['name'],
                    "tracks": item['tracks']['total'],
                    "image": item['images'][0]['url'] if item['images'] else None
                })
        return playlists
    except Exception as e:
        print(f"Error fetching playlists: {e}")
        raise HTTPException(status_code=401, detail="Failed to fetch playlists (token might be expired)")

from pydantic import BaseModel

class DownloadRequest(BaseModel):
    playlist_id: str
    token_info: Dict[str, Any]
    preferred_format: str = "wav"
    allow_lossy_fallback: bool = True
    track_limit: Optional[int] = None

class CandidateOut(BaseModel):
    username: str
    filename: str
    size: int
    ext_score: int
    reported_speed: Optional[float] = None
    peer_queue_len: Optional[int] = None

class TrackCandidates(BaseModel):
    artist: str
    title: str
    album: str
    candidates: List[CandidateOut]

class DownloadCandidateRequest(BaseModel):
    playlist_id: str
    playlist_name: str
    track: Dict[str, str]  # expects artist, title, album
    candidate: CandidateOut

@router.post("/download")
def start_download(req: DownloadRequest):
    # We need full token_info for the background worker (to refresh if needed)
    token_info = req.token_info
    preferred_format = (req.preferred_format or "wav").lower()
    if preferred_format not in ALLOWED_FORMATS:
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa wav, flac o aiff.")
    track_limit = req.track_limit
    if track_limit is not None and track_limit <= 0:
        track_limit = None
    
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
        preferred_format=preferred_format,
        allow_lossy_fallback=req.allow_lossy_fallback,
        track_limit=track_limit,
    )
    return {"job_id": job_id}

def _candidate_to_dict(c) -> Dict[str, Any]:
    return {
        "username": c.username,
        "filename": c.filename,
        "size": c.size,
        "ext_score": c.ext_score,
        "reported_speed": c.reported_speed,
        "peer_queue_len": c.peer_queue_len,
    }

@router.get("/playlists/{playlist_id}/candidates")
def get_candidates(playlist_id: str, token_data: Dict = Depends(get_current_user_token), limit_per_track: int = 5):
    """Return top candidates per track (preview) without downloading."""
    sp_client = SpotifyClient(access_token=token_data["access_token"])
    playlist_name, tracks = sp_client.get_playlist(playlist_id)

    slskd_host = os.getenv("SLSKD_HOST")
    slskd_api_key = os.getenv("SLSKD_API_KEY")
    if not slskd_host or not slskd_api_key:
        raise HTTPException(status_code=500, detail="Server misconfigured (missing Slskd config)")
    slsk_client = SoulseekClient(host=slskd_host, api_key=slskd_api_key, preferred_ext="flac")

    result: List[Dict[str, Any]] = []
    for t in tracks:
        seen = set()
        cands: List[Candidate] = []
        for q in t.query_strings():
            for c in slsk_client.search_lossless(q, preferred_ext="flac", lossless_only=False, response_limit=40):
                key = (c.username, c.filename)
                if key in seen:
                    continue
                seen.add(key)
                cands.append(c)
        # take top N by current sort order
        cands = cands[:limit_per_track]
        result.append(
            {
                "artist": t.artist,
                "title": t.title,
                "album": t.album,
                "candidates": [_candidate_to_dict(c) for c in cands],
            }
        )
    return {"playlist_name": playlist_name, "tracks": result}

@router.post("/download_candidate")
def download_candidate(req: DownloadCandidateRequest):
    """Download a specific candidate selected by the user."""
    slskd_host = os.getenv("SLSKD_HOST")
    slskd_api_key = os.getenv("SLSKD_API_KEY")
    slskd_download_dir = os.getenv("SLSKD_DOWNLOAD_DIR")
    output_root = os.getenv("OUTPUT_ROOT", "downloads/manual")
    if not slskd_host or not slskd_api_key or not slskd_download_dir:
        raise HTTPException(status_code=500, detail="Server misconfigured (missing Slskd config)")

    track = Track(artist=req.track.get("artist", ""), title=req.track.get("title", ""), album=req.track.get("album", ""))
    cand = req.candidate

    slsk_client = SoulseekClient(host=slskd_host, api_key=slskd_api_key, preferred_ext="flac")
    base_remote = basename_any(cand.filename)

    def locate_download() -> Optional[str]:
        direct = os.path.join(slskd_download_dir, base_remote)
        if os.path.exists(direct):
            return direct
        for root, _, files in os.walk(slskd_download_dir):
            for f in files:
                if f == base_remote:
                    return os.path.join(root, f)
        return None

    # enqueue
    try:
        slsk_client.enqueue_download(cand.username, cand.filename, cand.size)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Enqueue failed: {e}")
    ok, meta = slsk_client.wait_for_completion(
        cand.username,
        base_remote,
        timeout_s=1800.0,
        file_finder=locate_download,
    )
    src_guess = locate_download()
    if not ok and not src_guess:
        raise HTTPException(status_code=400, detail="Download failed or timed out")
    if not src_guess:
        raise HTTPException(status_code=404, detail="Downloaded file not found in slskd directory")

    ext = os.path.splitext(src_guess)[1]
    playlist_dir = os.path.join(output_root, safe_filename(req.playlist_name))
    os.makedirs(playlist_dir, exist_ok=True)
    final_name = safe_filename(f"{track.artist} - {track.title}{ext}")
    dst_path = os.path.join(playlist_dir, final_name)
    try:
        shutil.move(src_guess, dst_path)
    except Exception:
        shutil.copy2(src_guess, dst_path)
        os.remove(src_guess)

    return {"path": dst_path, "state": meta.get("state") if meta else "complete"}

@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.get("/jobs/{job_id}/download")
def download_job_result(job_id: str):
    job = JOBS.get(job_id)
    raise HTTPException(status_code=400, detail="Direct downloads only; access files under /downloads/")


@router.get("/jobs/{job_id}/files")
def list_job_files(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"files": job.files}


@router.get("/jobs/{job_id}/files/{file_path:path}")
def download_job_file(job_id: str, file_path: str):
    job = JOBS.get(job_id)
    if not job or job.status != "completed":
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


@router.get("/jobs/{job_id}/archive")
def download_job_archive(job_id: str, background_tasks: BackgroundTasks):
    """Bundle all files for a job into a zip and send it."""
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Allow archiving even if running (will zip what we have so far)
    output_root = os.getenv("OUTPUT_ROOT", "downloads")
    safe_root = os.path.abspath(output_root)
    if not job.files:
        raise HTTPException(status_code=404, detail="No files to archive")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp_path = tmp.name
    tmp.close()

    with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for rel_path in job.files:
            full_path = os.path.abspath(os.path.join(output_root, rel_path))
            if not full_path.startswith(safe_root):
                continue
            if not os.path.exists(full_path):
                continue
            arcname = os.path.basename(full_path)
            zf.write(full_path, arcname=arcname)

    # remove temp file after response is sent
    background_tasks.add_task(os.remove, tmp_path)
    zip_name = safe_filename(f"{job.playlist_name or 'soulmate'}.zip")
    return FileResponse(tmp_path, media_type="application/zip", filename=zip_name)
