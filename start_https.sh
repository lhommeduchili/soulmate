#!/bin/bash
# Script to generate SSL certificates and start the server with HTTPS

echo "🔒 Setting up HTTPS for localhost..."

# Ensure virtualenv exists
if [ ! -d ".venv" ]; then
    echo "❌ Virtual environment not found. Please run:"
    echo "   python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Generate certificates if they don't exist
if [ ! -f "certs/localhost-key.pem" ]; then
    echo "Generating SSL certificates..."
    cd certs
    mkcert localhost 127.0.0.1 ::1
    mv localhost+2-key.pem localhost-key.pem
    mv localhost+2.pem localhost.pem
    cd ..
    echo "✅ Certificates created!"
fi

# Ensure frontend build is present
if [ ! -d "dist" ]; then
    echo "⚠️  Frontend not built. Building now..."
    cd src/web/frontend && npm run build && cd ../../..
    cp -r src/web/frontend/dist ./dist
fi

echo "🚀 Starting server with HTTPS on https://localhost:8000"
.venv/bin/uvicorn src.web.app:app \
    --host 0.0.0.0 \
    --port 8000 \
    --ssl-keyfile=certs/localhost-key.pem \
    --ssl-certfile=certs/localhost.pem \
    --reload
