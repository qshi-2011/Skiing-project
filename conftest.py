"""
Root conftest.py — ensures the production ski_racing package at the repo root
is on sys.path BEFORE any track-local ski_racing stubs, regardless of which
directory pytest is invoked from.
"""
import sys
from pathlib import Path

# Force project root to sys.path[0] so `import ski_racing` always resolves to
# the canonical production package, not a track-local copy.
PROJECT_ROOT = str(Path(__file__).resolve().parent)
try:
    sys.path.remove(PROJECT_ROOT)
except ValueError:
    pass
sys.path.insert(0, PROJECT_ROOT)
