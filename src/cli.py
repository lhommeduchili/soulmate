from __future__ import annotations

import argparse
import os
from typing import Optional

from colorama import Fore, Style, init as colorama_init
from dotenv import load_dotenv

from src.downloader import Downloader
from src.soulseek_client import SoulseekClient
from src.spotify_client import SpotifyClient
from src.utils.formatting import DEFAULT_FORMAT_PREFERENCE, normalize_format_preference, safe_filename
from src.utils.logging import setup_logger


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Spotify → Soulseek lossless downloader (slskd)")
    p.add_argument("--playlist", required=True, help="Spotify playlist URL or ID")
    p.add_argument("--slskd-host", required=True, help="slskd base URL, e.g. https://localhost:5030")
    auth = p.add_mutually_exclusive_group(required=True)
    auth.add_argument("--slskd-api-key", help="slskd API key configured in slskd.yml")
    auth.add_argument("--slskd-user", help="slskd username (will prompt for --slskd-pass)")
    p.add_argument("--slskd-pass", help="slskd password (if using --slskd-user)")
    p.add_argument("--slskd-download-dir", required=True, help="Directory where slskd writes downloads")
    p.add_argument("--output-root", default="./downloads", help="Root path for playlist directory")
    p.add_argument("--max-retries", type=int, default=3, help="Max candidates to try per track")
    p.add_argument("--search-timeout-ms", type=int, default=15000, help="slskd search timeout ms")
    p.add_argument("--dry-run", action="store_true", help="Skip the actual download (for testing)")
    p.add_argument(
        "--preferred-format",
        choices=["wav", "flac", "aiff", "alac"],
        help="First choice format (legacy). If omitted, defaults to the built-in preference order.",
    )
    p.add_argument(
        "--format-preference",
        help="Comma-separated priority list, e.g. aiff,flac,wav[,lossy]. Defaults to aiff,flac,wav.",
    )
    p.add_argument(
        "--allow-lossy-fallback",
        action="store_true",
        default=True,
        help="If no lossless sources are found, allow falling back to other formats (e.g. MP3). Default: on.",
    )
    p.add_argument(
        "--no-lossy-fallback",
        action="store_false",
        dest="allow_lossy_fallback",
        help="Forzar solo lossless (ignora lossy incluso si no hay fuentes).",
    )
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
    load_dotenv()
    colorama_init(autoreset=True)
    logger = setup_logger()
    if args is None:
        args = build_parser().parse_args()
    banner()
    sp = SpotifyClient()
    playlist_name, tracks = sp.get_playlist(args.playlist)
    playlist_dir = os.path.join(args.output_root, safe_filename(playlist_name))
    os.makedirs(playlist_dir, exist_ok=True)

    format_preference_arg = None
    if args.format_preference:
        format_preference_arg = [p.strip() for p in args.format_preference.split(",") if p.strip()]
    elif args.preferred_format:
        format_preference_arg = [args.preferred_format]
    prefs = normalize_format_preference(format_preference_arg or DEFAULT_FORMAT_PREFERENCE)
    if args.allow_lossy_fallback:
        if "lossy" not in prefs:
            prefs.append("lossy")
    else:
        prefs = [p for p in prefs if p != "lossy"]

    if args.slskd_api_key:
        slsk = SoulseekClient(host=args.slskd_host, api_key=args.slskd_api_key, format_preferences=prefs)
    else:
        if not args.slskd_pass:
            raise SystemExit("--slskd-pass required when using --slskd-user")
        slsk = SoulseekClient(
            host=args.slskd_host,
            username=args.slskd_user,
            password=args.slskd_pass,
            format_preferences=prefs,
        )

    dl = Downloader(
        slsk=slsk,
        slskd_download_dir=args.slskd_download_dir,
        output_dir=playlist_dir,
        max_retries=args.max_retries,
        preferred_ext=None,
        format_preferences=prefs,
        allow_lossy_fallback=args.allow_lossy_fallback,
        dry_run=args.dry_run,
    )
    ok, fail = dl.run(playlist_name, tracks)
    print(Fore.GREEN + f"\nFinished: {ok} success, {fail} failed." + Style.RESET_ALL)
    return 0 if fail == 0 else 1
