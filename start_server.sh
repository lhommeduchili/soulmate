#!/bin/bash
# Startup script for Soulmate Web App

echo "🚀 Starting Soulmate Web Server..."
echo ""

# Check if venv exists
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment not found. Please run:"
    echo "   python -m venv .venv"
    exit 1
fi

# Check if dist exists
if [ ! -d "dist" ]; then
    echo "⚠️  Frontend not built. Building now..."
    cd src/web/frontend && npm run build && cd ../../..
    cp -r src/web/frontend/dist ./dist
fi

# Start the server
echo "✅ Starting FastAPI server on http://localhost:8000"
echo ""
.venv/bin/uvicorn src.web.app:app --host 0.0.0.0 --port 8000 --reload
