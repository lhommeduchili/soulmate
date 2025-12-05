# soulmate

Web app + CLI para bajar playlists de Spotify desde Soulseek (slskd) en la mejor calidad posible.

## Qué hace (v1)
- OAuth con Spotify, selección de playlist y formato preferido (WAV / FLAC / AIFF).
- Ranking automático de candidatos: extensión preferida → lossless primero → velocidad reportada → cola baja.
- Búsquedas con throttle y reintentos en 429; dedupe por (usuario, archivo); acepta rutas Windows/Unix.
- Descarga track a track desde slskd, espera a que termine, normaliza el nombre y empaqueta todo en un ZIP final.
- Progreso en vivo (tracks procesados/pending) y log en tiempo real desde FastAPI.
- Frontend SPA (React/Vite) mínimo pero funcional; backend FastAPI; despliegue local via Docker Compose (slskd + backend).

## Variables de entorno
Coloca un `.env` en la raíz con:
```
SPOTIPY_CLIENT_ID=...
SPOTIPY_CLIENT_SECRET=...
SPOTIPY_REDIRECT_URI=http://localhost:8000/api/auth/callback
SLSKD_API_KEY=...
# Opcional:
OUTPUT_ROOT=./downloads
```
slskd se configura vía `slskd_local/config/slskd.yml` (incluye el API key).

## Arranque rápido (local)
1. Python deps: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.
2. Frontend: `cd src/web/frontend && npm install && npm run build`.
3. Copia el build al backend (si `start_server.sh` no lo hace solo): `cp -r src/web/frontend/dist ./dist`.
4. Inicia slskd: `docker-compose up slskd`.
5. Backend: `./start_server.sh` (o `uvicorn src.web.app:app --host 0.0.0.0 --port 8000 --reload` con la venv activada).

## Arranque rápido (Docker Compose)
1. Asegúrate de tener el build del frontend (`npm run build` en `src/web/frontend`).
2. `docker-compose up --build backend slskd`.
   - Backend en `http://localhost:8000`.
   - slskd expuesto en `http://localhost:5030`.

## Uso del frontend
1. Abre `http://localhost:8000`.
2. Login con Spotify → vuelve con el token guardado en localStorage.
3. Selecciona playlist, formato preferido (WAV/FLAC/AIFF), decide si permitir fallback lossy y define un límite opcional de tracks.
4. Pulsa “Download”: se crea un job; abre la vista del job para ver progreso/log y descargar el ZIP final.

## CLI (opcional)
```
python -m src.main --playlist <url_o_id> \
  --slskd-host http://localhost:5030 \
  --slskd-api-key $SLSKD_API_KEY \
  --slskd-download-dir ./slskd_local/downloads \
  --preferred-format flac \
  --allow-lossy-fallback
```

## Tests & estilo
```
pytest
flake8
black --check .
```

## Licencia
MIT
