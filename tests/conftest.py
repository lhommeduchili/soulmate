import os
import sys
from pathlib import Path

# Ensure src/ is on the path for imports in tests
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
for p in (ROOT, SRC):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))
