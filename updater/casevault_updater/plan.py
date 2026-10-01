"""Which files an update changes, found by comparing each file on the SSD with the new commit.

Git names every file version by a fingerprint of its contents (the "blob id"): SHA-1 of
b"blob <size>\\0" + the bytes. GitHub lists the fingerprint of every file at a commit in one
request, so the updater fingerprints the files on the SSD the same way and fetches only those that
differ. This works whatever the SSD holds: last month's version, a hand-copied ZIP, or a copy
where one file was damaged.

Where each repository file goes:
    tools/...            -> the CV-AI drive (W:\\), without the "tools/" part
    repo-only files      -> nowhere (.github/, tests/, scripts/, updater/; see config)
    everything else      -> the CaseVault-App folder

Removing files: only files that were part of the *previous* recorded commit and are gone from the
new one are removed (the previous file list says which). Without a version.json nothing is removed,
so the updater can never delete a file it didn't put there.
"""

import hashlib
import os
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

from .config import TOOLS_PREFIX, UPDATER_PREFIX, Settings, is_app_file, is_updater_file, updater_live_dir, updater_next_dir
from .errors import UpdaterError
from .github import GitHub, TreeEntry

ADD, UPDATE, DELETE = "add", "update", "delete"


class UnsafePath(UpdaterError):
    def __init__(self, path: str):
        super().__init__(f"The update names a file outside CaseVault's folders ({path!r}); it was stopped and nothing was changed.")


def blob_sha(data: bytes) -> str:
    """Git's fingerprint of some file contents."""
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()


def file_blob_sha(path: str) -> Optional[str]:
    """Git's fingerprint of a file on disk, or None if it isn't there (or can't be read)."""
    try:
        size = os.path.getsize(path)
        h = hashlib.sha1()
        h.update(b"blob %d\0" % size)
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


@dataclass(frozen=True)
class Change:
    action: str        # add | update | delete
    area: str          # "app" or "tools"
    path: str          # repository path, e.g. "js/vault.js" or "tools/Start-CaseVault.bat"
    rel: str           # path inside its area, e.g. "js/vault.js" or "Start-CaseVault.bat"
    target: str        # full path on disk
    sha: str = ""      # new blob id (add/update)
    size: int = 0      # new size in bytes (add/update)


@dataclass
class Plan:
    commit: str
    changes: List[Change] = field(default_factory=list)
    unchanged: int = 0
    notes: List[str] = field(default_factory=list)

    def of(self, action: str) -> List[Change]:
        return [c for c in self.changes if c.action == action]

    @property
    def downloads(self) -> List[Change]:
        return [c for c in self.changes if c.action in (ADD, UPDATE)]

    @property
    def download_bytes(self) -> int:
        return sum(c.size for c in self.downloads)

    @property
    def empty(self) -> bool:
        return not self.changes

    def summary(self) -> str:
        if self.empty:
            return f"Every file already matches the newest version ({self.unchanged} files checked)."
        parts = []
        for action, word in ((UPDATE, "changed"), (ADD, "new"), (DELETE, "to remove")):
            n = len(self.of(action))
            if n:
                parts.append(f"{n} {word}")
        size = self.download_bytes
        kb = f"{size / 1024:.0f} KB" if size < 1024 * 1024 else f"{size / 1048576:.1f} MB"
        return f"{', '.join(parts)} ({kb} to download; {self.unchanged} files already up to date)."


def safe_join(root: str, rel: str) -> str:
    """root + a repository path, refusing anything that would land outside root."""
    parts = rel.split("/")
    if not rel or rel.startswith("/") or any(p in ("", ".", "..") or ":" in p or "\\" in p for p in parts):
        raise UnsafePath(rel)
    full = os.path.normpath(os.path.join(root, *parts))
    base = os.path.normpath(root)
    if os.path.commonpath([full, base]) != base:
        raise UnsafePath(rel)
    return full


def _place(entry_path: str, settings: Settings, tools_dir: Optional[str]):
    """(area, rel, root) for a repository path, or None when it doesn't go anywhere."""
    if is_updater_file(entry_path):
        return ("updater", entry_path[len(UPDATER_PREFIX):], updater_next_dir(settings))
    if entry_path.startswith(TOOLS_PREFIX):
        return ("tools", entry_path[len(TOOLS_PREFIX):], tools_dir) if tools_dir else None
    if is_app_file(entry_path, settings):
        return ("app", entry_path, settings.app_dir)
    return None


def make_plan(settings: Settings, new_commit: str, new_tree: List[TreeEntry], old_tree: Optional[List[TreeEntry]] = None,
              tools_dir: Optional[str] = None, progress: Optional[Callable[[int, int], None]] = None) -> Plan:
    """Compare the SSD with the new commit's files. Reads files, changes nothing."""
    plan = Plan(commit=new_commit)
    if tools_dir is None:
        plan.notes.append("The CV-AI drive (with Start-CaseVault.bat) isn't plugged in, so the W: tools are left as they are.")
    placed = []
    for e in new_tree:
        where = _place(e.path, settings, tools_dir)
        if where:
            area, rel, root = where
            placed.append((e, area, rel, safe_join(root, rel)))
    for i, (e, area, rel, target) in enumerate(placed):
        if progress:
            progress(i, len(placed))
        local = file_blob_sha(target)
        if area == "updater":
            # The updater's own files are compared with the ones it runs from (or ones already waiting in _next).
            live = file_blob_sha(safe_join(updater_live_dir(settings), rel))
            local = e.sha if e.sha in (live, local) else live
        if local == e.sha:
            plan.unchanged += 1
        else:
            plan.changes.append(Change(ADD if local is None else UPDATE, area, e.path, rel, target, e.sha, e.size))
    # Files the previous version had that the new one doesn't.
    if old_tree is None:
        plan.notes.append("No record of the previous version, so no old files are removed.")
    else:
        new_paths = {e.path for e in new_tree}
        for e in old_tree:
            if e.path in new_paths:
                continue
            where = _place(e.path, settings, tools_dir)
            if not where:
                continue
            area, rel, root = where
            if area == "updater":
                continue  # an old updater file is left alone (it's no longer used)
            target = safe_join(root, rel)
            if os.path.isfile(target):
                plan.changes.append(Change(DELETE, area, e.path, rel, target))
    if progress:
        progress(len(placed), len(placed))
    return plan


def plan_update(settings: Settings, gh: GitHub, new_commit: str, old_commit: Optional[str] = None,
                tools_dir: Optional[str] = None, progress=None) -> Plan:
    """Fetch the file lists (one or two requests) and make the plan."""
    new_tree = gh.tree(new_commit)
    old_tree = gh.tree(old_commit) if old_commit and old_commit != new_commit else None
    if old_commit == new_commit:
        old_tree = new_tree
    return make_plan(settings, new_commit, new_tree, old_tree, tools_dir, progress)
