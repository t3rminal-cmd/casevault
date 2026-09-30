"""Download the changed files into a staging folder, each one checked before it is kept.

Nothing in CaseVault is touched here. Files go to

    <app folder>\\.update-staging\\<commit>\\app\\...     for the CaseVault-App folder
    <app folder>\\.update-staging\\<commit>\\tools\\...   for the CV-AI drive (W:\\)

Every file is fingerprinted as it arrives (the same Git blob id the plan compared) and a file
whose fingerprint is wrong is fetched again, up to `retries` times. A file already staged with the
right fingerprint (from an earlier attempt that was interrupted) isn't fetched again. When all are
in, a manifest.json lists what the install step will do; its presence means "staging complete".
"""

import json
import os
import shutil
import time
from typing import Callable, Optional

from .config import Settings
from .errors import UpdaterError
from .github import GitHub
from .plan import Plan, blob_sha, file_blob_sha, safe_join

STAGING = ".update-staging"
MANIFEST = "manifest.json"
MARGIN = 20 * 1024 * 1024   # keep this much free besides the download itself


class CorruptDownload(UpdaterError):
    def __init__(self, path: str):
        super().__init__(f"{path} kept arriving damaged, so the update was stopped and nothing was changed. Try again later.")


class DiskFull(UpdaterError):
    def __init__(self, need: int, free: int, where: str):
        super().__init__(f"Not enough free space on {where}: the update needs about {need / 1048576:.1f} MB, "
                         f"{free / 1048576:.1f} MB is free. Nothing was changed.")


def staging_root(settings: Settings) -> str:
    return os.path.join(settings.app_dir, STAGING)


def staging_dir(settings: Settings, commit: str) -> str:
    return os.path.join(staging_root(settings), commit)


def _free(path: str) -> Optional[int]:
    p = path
    while p and not os.path.exists(p):
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    try:
        return shutil.disk_usage(p).free
    except OSError:
        return None


def check_space(settings: Settings, plan: Plan, tools_dir: Optional[str] = None) -> None:
    """Room for the staged copy plus the backup (at most the same again) on the SSD, and for the
    new tools on the CV-AI drive."""
    need = 2 * plan.download_bytes + MARGIN
    free = _free(settings.app_dir)
    if free is not None and free < need:
        raise DiskFull(need, free, "the CaseVault drive")
    tools = sum(c.size for c in plan.downloads if c.area == "tools")
    if tools and tools_dir:
        free = _free(tools_dir)
        if free is not None and free < tools + MARGIN:
            raise DiskFull(tools + MARGIN, free, "the CV-AI drive")


def _write(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def download(settings: Settings, gh: GitHub, plan: Plan, tools_dir: Optional[str] = None,
             progress: Optional[Callable[[int, int, str], None]] = None, retries: int = 3,
             pause: float = 1.0) -> str:
    """Fetch every add/update in the plan into the staging folder; returns that folder.
    progress(bytes done, bytes total, current path) is called before and after each file."""
    check_space(settings, plan, tools_dir)
    root = staging_dir(settings, plan.commit)
    # Staged copies of other commits are stale: an update was started and never finished.
    base = staging_root(settings)
    if os.path.isdir(base):
        for name in os.listdir(base):
            if name != plan.commit:
                shutil.rmtree(os.path.join(base, name), ignore_errors=True)
    manifest_path = os.path.join(root, MANIFEST)
    if os.path.exists(manifest_path):
        os.remove(manifest_path)

    total, done = plan.download_bytes, 0
    for c in plan.downloads:
        if progress:
            progress(done, total, c.path)
        dest = safe_join(os.path.join(root, c.area), c.rel)
        if file_blob_sha(dest) != c.sha:
            for attempt in range(retries):
                data = gh.raw_file(plan.commit, c.path)
                if blob_sha(data) == c.sha:
                    _write(dest, data)
                    break
                if attempt + 1 < retries and pause:
                    time.sleep(pause * (attempt + 1))
            else:
                raise CorruptDownload(c.path)
        done += c.size
    if progress:
        progress(done, total, "")

    manifest = {
        "commit": plan.commit,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "changes": [{"action": c.action, "area": c.area, "path": c.path, "rel": c.rel, "sha": c.sha, "size": c.size}
                    for c in plan.changes],
    }
    os.makedirs(root, exist_ok=True)
    _write(manifest_path, json.dumps(manifest, indent=2).encode("utf-8"))
    return root


def read_manifest(root: str) -> Optional[dict]:
    """The staging manifest, or None when staging didn't finish."""
    try:
        with open(os.path.join(root, MANIFEST), "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) and isinstance(data.get("changes"), list) else None
    except (OSError, ValueError):
        return None


def clear_staging(settings: Settings) -> None:
    shutil.rmtree(staging_root(settings), ignore_errors=True)

