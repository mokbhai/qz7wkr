"""Vercel installs the repo-root requirements.txt; keep it pinned to the same versions as the backend."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _pins(path: Path) -> dict[str, str]:
    lines = [line.split("==") for line in path.read_text().splitlines() if "==" in line]
    return {name.split("[")[0]: version for name, version in lines}


def test_vercel_requirements_match_backend():
    backend, vercel = _pins(ROOT / "backend" / "requirements.txt"), _pins(ROOT / "requirements.txt")
    assert vercel and all(backend.get(name) == version for name, version in vercel.items())
