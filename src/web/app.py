from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
import os
from dotenv import load_dotenv

try:
    load_dotenv()
except OSError as exc:
    # Prevent startup from crashing if .env is unreadable in the container.
    print(f"[soulmate] Warning: could not load .env ({exc})")

from src.web.api import router as api_router

app = FastAPI(title="Soulmate Web")

session_secret = os.getenv("SESSION_SECRET")
if not session_secret:
    raise RuntimeError("SESSION_SECRET env var is required for session signing")
session_https_only = os.getenv("SESSION_HTTPS_ONLY", "false").lower() == "true"
session_secure_cookie = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
session_same_site = os.getenv("SESSION_SAMESITE", "lax")

app.add_middleware(
    SessionMiddleware,
    secret_key=session_secret,
    https_only=session_https_only,
    max_age=3600,  # 1 hour
    same_site=session_same_site,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Mount frontend static files last (catch-all)
# Mount frontend static files last (catch-all)
# Use absolute path to ensure we find the dist folder regardless of where uvicorn is run from
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "frontend", "dist")
ASSETS_DIR = os.path.join(DIST_DIR, "assets")

if os.path.exists(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

# Catch-all for SPA (serve index.html for any other route)
@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    # Check if it's a file in dist (e.g. vite.svg)
    potential_path = os.path.join(DIST_DIR, full_path)
    if os.path.exists(potential_path) and os.path.isfile(potential_path):
        return FileResponse(potential_path)
        
    index_path = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend not built. Run 'npm run build' in src/web/frontend"}
