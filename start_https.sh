#!/bin/bash
# Script to generate SSL certificates and start the server with HTTPS

echo "🔒 Setting up HTTPS for localhost..."

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

echo "🚀 Starting server with HTTPS on https://localhost:8000"
.venv/bin/uvicorn src.web.app:app \
    --host 0.0.0.0 \
    --port 8000 \
    --ssl-keyfile=certs/localhost-key.pem \
    --ssl-certfile=certs/localhost.pem \
    --reload
