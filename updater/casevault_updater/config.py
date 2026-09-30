"""Where things are.

The updater lives inside the app folder on the SSD, e.g. V:\\CaseVault-App\\updater\\, so the app
folder is simply its parent. The repository and branch are fixed here: t3rminal-cmd/casevault,
branch main (the same public repository GitHub Pages publishes from).

An optional updater-settings.json next to this package's folder can override any of these
(for testing, or if the repository ever moves). It never holds secrets: the repository is public,
so no token is needed or used.
"""

import json
import os
from dataclasses import dataclass, field, replace
from typing import List, Optional

OWNER = "t3rminal-cmd"
REPO = "casevault"
BRANCH = "main"

UPDATER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # ...\CaseVault-App\updater
DEFAULT_APP_DIR = os.path.dirname(UPDATER_DIR)                             # ...\CaseVault-App

# Repository paths that are never copied into the app folder: they're for developers, and the
# updater itself (a running program can't safely replace itself; it says when a newer one exists).
EXCLUDE_PREFIXES = (".github/", "tests/", "scripts/", "updater/", "tools/")
EXCLUDE_FILES = (".gitignore", ".gitattributes")

# The tools on the CV-AI drive (W:) come from the repository's tools/ folder.
TOOLS_PREFIX = "tools/"


@dataclass(frozen=True)
class Settings:
    owner: str = OWNER
    repo: str = REPO
    branch: str = BRANCH
    app_dir: str = DEFAULT_APP_DIR
    tools_dir: Optional[str] = None          # found by find_tools_dir() when None
    timeout: float = 20.0                     # seconds per request
    exclude_prefixes: tuple = EXCLUDE_PREFIXES
    exclude_files: tuple = EXCLUDE_FILES

    @property
    def repo_slug(self) -> str:
        return f"{self.owner}/{self.repo}"

    @property
    def version_file(self) -> str:
        return os.path.join(self.app_dir, "version.json")


def load(path: Optional[str] = None) -> Settings:
    """The settings, with any overrides from updater-settings.json (unknown keys are ignored)."""
    s = Settings()
    path = path or os.path.join(UPDATER_DIR, "updater-settings.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return s
    allowed = {k: v for k, v in data.items() if k in {"owner", "repo", "branch", "app_dir", "tools_dir", "timeout"}}
    return replace(s, **allowed)


def is_app_file(path: str, settings: Settings) -> bool:
    """True for repository files that belong in the app folder (index.html, js/…, css/…, docs/…)."""
    return not path.startswith(settings.exclude_prefixes) and path not in settings.exclude_files


def find_tools_dir(drives: Optional[List[str]] = None) -> Optional[str]:
    """The root of the CV-AI drive: the drive whose root has Start-CaseVault.bat and the
    casevault-helper folder (usually W:\\). None when it isn't plugged in."""
    if drives is None:
        drives = [f"{c}:\\" for c in "DEFGHIJKLMNOPQRSTUVWXYZ"] if os.name == "nt" else []
    for d in drives:
        if os.path.isfile(os.path.join(d, "Start-CaseVault.bat")) and os.path.isdir(os.path.join(d, "casevault-helper")):
            return d
    return None
