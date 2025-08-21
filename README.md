# soulmate

Download a Spotify playlist as **lossless** tracks from **Soulseek** using the
[slskd](https://github.com/slskd/slskd) daemon and the Spotify Web API via
[Spotipy](https://spotipy.readthedocs.io).

---

## Features

- Fetch playlist metadata (artist, title, album) from Spotify.
- Search Soulseek via **slskd** for each track.
- Filter results to **lossless** formats only (FLAC, ALAC, WAV).
- Rank sources by a heuristic (extension preference, reported upload speed, queue length).
- Retry failovers automatically when a source fails.
- CLI with `tqdm` progress bars and a fun **Matrix green** aesthetic.
- Files saved into a directory named after the playlist, as `Artist - Title.<ext>`.

## How it works

- Spotify: uses **Spotipy** (client-credentials) to read public playlist items. See Spotify Web API docs for playlist tracks.  
  References: Spotipy docs and Spotify Web API reference.  
- Soulseek: talks to your **slskd** instance using the **slskd-api** Python client.  
  Key endpoints: `SearchesApi.search_text/search_responses`, `TransfersApi.enqueue/get_all_downloads`.

Links:
- slskd API python client docs (searches/transfers): see *SearchesApi* and *TransfersApi* pages.  
- Spotipy quickstart (credentials) and Spotify *Get Playlist Items* reference.

## Requirements

- Python 3.9+
- A running **slskd** instance reachable via HTTP(S), with an API key **or** username/password login.
- Spotify API credentials (`SPOTIPY_CLIENT_ID`, `SPOTIPY_CLIENT_SECRET`).

## Install

```bash
git clone https://github.com/lhommeduchili/soulmate.git
cd soulmate
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"    # or: pip install -r requirements.txt
```

Create a `.env` file (or export env vars) with your Spotify creds:

```bash
SPOTIPY_CLIENT_ID=your_client_id
SPOTIPY_CLIENT_SECRET=your_client_secret
# Optional if you use OAuth flows; not needed for public playlists with client credentials.
SPOTIPY_REDIRECT_URI=http://localhost:8080/callback
```

Configure **slskd** with an API key (or username/password). Example slskd config snippet:

```yaml
web:
  authentication:
    api_keys:
      my_cli:
        key: "REDACTED_API_KEY"
        role: readwrite
```

## Usage

```bash
python -m src.main "https://open.spotify.com/playlist/37i9dQZF1DX4dyzvuaRJ0n"   --slskd-host http://localhost:5030   --slskd-api-key YOUR_SLSKD_API_KEY   --slskd-download-dir "/path/where/slskd/downloads"   --output-root "./downloads"
```

Alternatively, as an installed console script:

```bash
soulmate --playlist "spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n"     --slskd-host http://localhost:5030     --slskd-api-key YOUR_SLSKD_API_KEY
```

Flags:

- `--playlist` (required): Spotify playlist URL or ID.
- `--slskd-host` (required): Base URL to slskd (e.g., `http://localhost:5030`).
- Auth **either**: `--slskd-api-key KEY` **or** `--slskd-user USER --slskd-pass PASS`.
- `--slskd-download-dir`: Directory where slskd writes files (so we can move/rename after completion).
- `--output-root`: Where to create the playlist folder. Defaults to `./downloads`.
- `--max-retries`: Per-track download attempts across sources. Default: 3.
- `--search-timeout-ms`: slskd search timeout in ms. Default: 15000.
- `--dry-run`: Do everything except enqueue downloads.

## Development

- Code style: **black** + **flake8**.
- Tests: **pytest**. Mocks are used for Spotify and slskd.
- Type hints throughout. Docstrings and modular design for easy future extension (caching, web UI, etc.).

### Run linters & tests

```bash
flake8
black --check .
pytest -q
```

## Roadmap

- Concurrent download orchestration.
- Caching of search results and album-level heuristics.
- Optional audio fingerprint verification.

## License

MIT
