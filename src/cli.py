from __future__ import annotations

import argparse
import os
from typing import Optional

from colorama import Fore, Style, init as colorama_init

from downloader import Downloader
from soulseek_client import SoulseekClient
from spotify_client import SpotifyClient
from utils.formatting import safe_filename
from utils.logging import setup_logger


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Spotify → Soulseek lossless downloader (slskd)")
    p.add_argument("--playlist", required=True, help="Spotify playlist URL or ID")
    p.add_argument("--slskd-host", required=True, help="slskd base URL, e.g. http://localhost:5030")
    auth = p.add_mutually_exclusive_group(required=True)
    auth.add_argument("--slskd-api-key", help="slskd API key configured in slskd.yml")
    auth.add_argument("--slskd-user", help="slskd username (will prompt for --slskd-pass)")
    p.add_argument("--slskd-pass", help="slskd password (if using --slskd-user)")
    p.add_argument("--slskd-download-dir", required=True, help="Directory where slskd writes downloads")
    p.add_argument("--output-root", default="./downloads", help="Root path for playlist directory")
    p.add_argument("--max-retries", type=int, default=3, help="Max candidates to try per track")
    p.add_argument("--search-timeout-ms", type=int, default=15000, help="slskd search timeout ms")
    p.add_argument("--dry-run", action="store_true", help="Skip the actual download (for testing)")
    return p


def banner() -> None:
    # simple Matrix-y vibe
    print(Fore.GREEN + """

                           888                        888            
                           888                        888            
                           888                        888            
.d8888b   .d88b.  888  888 888 88888b.d88b.   8888b.  888888 .d88b.  
88K      d88""88b 888  888 888 888 "888 "88b     "88b 888   d8P  Y8b 
"Y8888b. 888  888 888  888 888 888  888  888 .d888888 888   88888888 
     X88 Y88..88P Y88b 888 888 888  888  888 888  888 Y88b. Y8b.     
 88888P'  "Y88P"   "Y88888 888 888  888  888 "Y888888  "Y888 "Y8888  
                                                                     
    """ + Style.RESET_ALL)


def run_cli(args: Optional[argparse.Namespace] = None) -> int:
    colorama_init(autoreset=True)
    logger = setup_logger()
    if args is None:
        args = build_parser().parse_args()
    banner()
    sp = SpotifyClient()
    playlist_name, tracks = sp.get_playlist(args.playlist)
    playlist_dir = os.path.join(args.output_root, safe_filename(playlist_name))
    os.makedirs(playlist_dir, exist_ok=True)

    if args.slskd_api_key:
        slsk = SoulseekClient(host=args.slskd_host, api_key=args.slskd_api_key)
    else:
        if not args.slskd_pass:
            raise SystemExit("--slskd-pass required when using --slskd-user")
        slsk = SoulseekClient(host=args.slskd_host, username=args.slskd_user, password=args.slskd_pass)

    dl = Downloader(
        slsk=slsk,
        slskd_download_dir=args.slskd_download_dir,
        output_dir=playlist_dir,
        max_retries=args.max_retries,
        dry_run=args.dry_run,
    )
    ok, fail = dl.run(playlist_name, tracks)
    print(Fore.GREEN + f"\nFinished: {ok} success, {fail} failed." + Style.RESET_ALL)
    return 0 if fail == 0 else 1
