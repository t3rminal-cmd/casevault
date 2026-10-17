"""What's new in the update, for the window (updater 1.3).

CaseVault's guide (docs/USING-CASEVAULT.md) keeps a "### What's new in v1.143" section for each of
the latest versions, newest first, each a list of "- **Title:** text" lines. After the download
the new guide is in the staging folder (or, when it didn't change, in the app folder), so the
window can show the sections newer than the version on the SSD instead of a list of file names.
Reads files only; never fails (no notes is fine).
"""

import os
import re
from typing import List, Optional, Tuple

from .config import Settings
from .download import staging_dir
from .version import app_version_in

GUIDE = "docs/USING-CASEVAULT.md"
HEAD_RE = re.compile(r"^#{2,4}\s+What's new in v(\d+(?:\.\d+)*)\s*$", re.I)


def version_key(v: str) -> Tuple[int, ...]:
    """"1.143" or "1.143.0" → (1, 143, 0), so they compare as numbers."""
    parts = [int(p) for p in re.findall(r"\d+", v or "")][:3]
    return tuple(parts + [0] * (3 - len(parts)))


def short(v: str) -> str:
    """"1.143.0" → "1.143" (how CaseVault shows its version)."""
    return re.sub(r"\.0$", "", v or "")


def plain(line: str) -> str:
    """A guide line without its Markdown: bullets, **bold**, `code` and [links](…)."""
    t = re.sub(r"^\s*[-*]\s+", "", line.rstrip())
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    return t.replace("**", "").replace("`", "")


def whats_new(text: str, after: str = "", limit: int = 6) -> List[Tuple[str, List[str]]]:
    """[(version, [points])] for each "What's new in vX" section newer than `after`, newest first.
    With no `after` (version unknown), only the newest section."""
    out: List[Tuple[str, List[str]]] = []
    cur: Optional[Tuple[str, List[str]]] = None
    for line in (text or "").splitlines():
        m = HEAD_RE.match(line)
        if m:
            cur = (m.group(1), [])
            out.append(cur)
        elif line.startswith("#"):
            cur = None
        elif cur is not None and re.match(r"^\s*[-*]\s+\S", line):
            cur[1].append(plain(line))
    out = [s for s in out if s[1]]
    out.sort(key=lambda s: version_key(s[0]), reverse=True)
    if after:
        out = [s for s in out if version_key(s[0]) > version_key(after)]
    else:
        out = out[:1]
    return out[:limit]


def _read(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return ""


def staged_or_live(settings: Settings, commit: str, rel: str) -> str:
    """A file of the new version: the staged copy when the update changes it, else the one on the SSD."""
    staged = os.path.join(staging_dir(settings, commit), "app", *rel.split("/"))
    return _read(staged) if os.path.isfile(staged) else _read(os.path.join(settings.app_dir, *rel.split("/")))


def new_version(settings: Settings, commit: str) -> str:
    """The version number the update installs ("1.143.0"), or ''."""
    return app_version_in(staged_or_live(settings, commit, "js/vault.js"))


def for_update(settings: Settings, commit: str, installed: str) -> List[Tuple[str, List[str]]]:
    return whats_new(staged_or_live(settings, commit, GUIDE), installed)
