@router.post("/download")
def start_download(req: DownloadRequest, session: SessionData = Depends(_require_session)):
    from src.web.state import MAX_CONCURRENT_JOBS

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
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.owner_id and job.owner_id != session.spotify_user_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este job")
    return job
