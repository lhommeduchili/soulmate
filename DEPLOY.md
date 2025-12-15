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

## Step 3: Cloudflare Tunnel Setup

1.  Go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2.  Navigate to **Networks > Tunnels**.
3.  Click **Create a Tunnel**.
4.  Name it `soulmate-pi`.
5.  **Choose your environment**: Select **Docker**.
6.  You will see a command like `docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <HUGE_STRING>`.
7.  **Copy ONLY the token string** (the part after `--token`).
8.  Paste this token into your `.env` file as `TUNNEL_TOKEN`.

### Configure Public Hostname
1.  In the Tunnel setup page, click **Next**.
2.  **Public Hostname**:
    -   **Subdomain**: `soulmate`
    -   **Domain**: `lhommeduchili.xyz`
    -   **Path**: leave empty
3.  **Service**:
    -   **Type**: `HTTP`
    -   **URL**: `soulmate-backend:8000` (Note: we use the container name `soulmate-backend` here, not localhost, because the tunnel is running inside the docker network).

## Step 4: Run the Application

Build and start the services using the production compose file:

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

This will:
1.  Build the frontend assets (Node.js).
2.  Build the backend container with the python environment.
3.  Start `slskd`, the backend, and the Cloudflare tunnel.

## Step 5: Verify

1.  Check container status: `docker-compose -f docker-compose.prod.yml ps`.
2.  Visit `https://soulmate.lhommeduchili.xyz` from any device.

## Troubleshooting

-   **Logs**: `docker-compose -f docker-compose.prod.yml logs -f`
-   **Architecture**: If you are on a very old Pi (ARMv6/v7), you might run into issues with the `node:18-alpine` or `slskd` images. Pi 3/4/5 (ARM64) are fully supported.
