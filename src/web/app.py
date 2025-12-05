from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.sessions import SessionMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

from src.web.api import router as api_router

app = FastAPI(title="Soulmate Web")

app.add_middleware(
    SessionMiddleware, 
    secret_key="super-secret-key-change-me",
    https_only=False, # Relax for local dev debugging
    max_age=3600 # 1 hour
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

if os.path.exists("downloads"):
    app.mount("/downloads", StaticFiles(directory="downloads"), name="downloads")

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
