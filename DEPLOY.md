# Soulmate Deployment Guide (Raspberry Pi)

This guide walks you through deploying Soulmate on a Raspberry Pi using Docker and exposing it to the world securely via Cloudflare Tunnel.

## Prerequisites

1.  **Raspberry Pi** (3, 4, or 5) running a 64-bit OS (recommended).
2.  **Docker & Docker Compose** installed on the Pi.
3.  **Cloudflare Account** with a domain active (e.g., `lhommeduchili.xyz`).
4.  **Spotify Developer App** credentials (Client ID & Secret).

## Step 1: Transfer Code to Raspberry Pi

You can clone the repository directly on the Pi or copy files over using `scp` or `rsync`.

## Step 2: Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env  # or just create one
nano .env
```

Add your Spotify credentials and the session secret:

```env
SPOTIPY_CLIENT_ID=your_spotify_client_id
SPOTIPY_CLIENT_SECRET=your_spotify_client_secret
SPOTIPY_REDIRECT_URI=https://soulmate.lhommeduchili.xyz/api/auth/callback
SESSION_SECRET=super_secret_random_string
SLSKD_API_KEY=your_slskd_api_key_here
# Optional:
TUNNEL_TOKEN=your_cloudflare_tunnel_token
```

> [!IMPORTANT]
> The `SPOTIPY_REDIRECT_URI` must match the domain you will set up in Cloudflare (https://soulmate.lhommeduchili.xyz/api/auth/callback) and must be whitelisted in your Spotify Developer Dashboard.

## Step 3: Create Dedicated Local Tunnel

To keep the configuration inside this project directory and isolated from your n8n Setup, we will create a **new tunnel** just for Soulmate.

### 1. Authenticate & Create Tunnel (using Docker)
Since we want to avoid installing binaries on the host if possible, we use the docker image to generate the credentials.

1.  **Login to Cloudflare**:
    ```bash
    # Create directory and set permissions (cloudflared runs as user 65532)
    mkdir -p cloudflared
    chmod 777 cloudflared

    # This will print a URL. Visit it in your browser to authorize.
    # It will save a cert.pem to your ./cloudflared directory.
    docker run -it --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel login
    ```

2.  **Create the Tunnel**:
    ```bash
    # Replace 'soulmate-pi' with any name you like
    docker run -it --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel create soulmate-alpi
    ```
    This command will:
    *   Create a tunnel ID.
    *   Create a JSON credentials file in `./cloudflared/<UUID>.json`.
    *   **NOTE**: You must rename this file to `credentials.json` so our config matches easily, OR copy the UUID and update `cloudflared/config.yml`.
    
    **Easier path**: Run `mv cloudflared/*.json cloudflared/credentials.json`.

### 2. Configure `config.yml`
Edit the file `cloudflared/config.yml` in this project:

```yaml
tunnel: <PASTE-YOUR-TUNNEL-UUID-HERE>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: soulmate.lhommeduchili.xyz
    service: http://soulmate-backend:8000
  - service: http_status:404
```

### 3. Route DNS
Finally, tell Cloudflare to point the domain to this new tunnel:

```bash
docker run -it --rm -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared:latest tunnel route dns -f soulmate-alpi soulmate.lhommeduchili.xyz
```

## Step 4: Run the Application

Build and start the services using the production compose file:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This will:
1.  Build the frontend assets (Node.js).
2.  Build the backend container with the python environment.
3.  Start `slskd`, the backend, and the Cloudflare tunnel.

## Step 5: Verify

1.  Check container status: `docker compose -f docker-compose.prod.yml ps`.
2.  Visit `https://soulmate.lhommeduchili.xyz` from any device.

## Troubleshooting

-   **Logs**: `nan`
-   **Architecture**: If you are on a very old Pi (ARMv6/v7), you might run into issues with the `node:18-alpine` or `slskd` images. Pi 3/4/5 (ARM64) are fully supported.

## Updating the Application

When you make changes to the code (frontend or backend), you DO NOT need to redo the tunnel or config steps. Just follow this loop:

1.  **Push changes** from your computer:
    ```bash
    git add .
    git commit -m "New features"
    git push origin version/raspi-compatible
    ```

2.  **Pull & Rebuild** on the Raspberry Pi:
    ```bash
    # Go to folder
    cd soulmate

    # Get latest code
    git pull origin version/raspi-compatible

    # Rebuild and restart (only modified containers will restart)
    docker-compose -f docker-compose.prod.yml up -d --build
    ```
