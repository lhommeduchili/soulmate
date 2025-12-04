from __future__ import annotations

try:  # support running both `python -m src.main` and `python src/main.py`
    from src.cli import run_cli
except ImportError:  # pragma: no cover - fallback for script execution
    from cli import run_cli

def main() -> None:
    raise SystemExit(run_cli())

if __name__ == "__main__":
    main()
