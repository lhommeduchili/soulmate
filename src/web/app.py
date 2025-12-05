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
# Mount assets specifically
if os.path.exists("dist/assets"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
if os.path.exists("downloads"):
    app.mount("/downloads", StaticFiles(directory="downloads"), name="downloads")

# Catch-all for SPA (serve index.html for any other route)
@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    if os.path.exists("dist/index.html"):
        return FileResponse("dist/index.html")
    return {"message": "Frontend not built. Run 'npm run build' in src/web/frontend"}
