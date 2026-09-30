"""Put a staged update in place, with a backup of everything it replaces, and put it all back if
anything goes wrong.

The order, so that a failure (or a power cut, or the SSD pulled out) at any moment leaves
CaseVault as it was or lets it be put back:

  1. The staged files are checked once more (each file's fingerprint must match the manifest).
  2. Every file the update replaces or removes is copied to
         <app folder>\\.update-backup\\<time>-<commit>\\{app,tools}\\...
     together with the current version.json.
  3. A journal (.update-journal.json in the app folder) is written: the list of changes and that
     the install has started. Only now is anything in CaseVault touched.
  4. Each file is replaced (written next to its place, then swapped in) or removed; the journal
     counts the ones done.
  5. version.json is written for the new commit, the journal removed, the staging folder cleared.

If step 4 fails, what was done is undone from the backup, in reverse order, and the error says so.
If the updater was stopped half-way (power cut), the journal is still there and the next run
undoes it first (recover()). The newest backups are kept, so "Undo the last update" can put the
previous version back later (undo_last()).

CaseVault-Data (the cases) is never touched: only paths inside the app folder and the CV-AI
drive's tools are, and every path is checked (safe_join).
"""

import json
import os
import shutil
import time
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from .config import Settings
from .download import read_manifest, staging_root
from .errors import UpdaterError
from .plan import ADD, DELETE, UPDATE, file_blob_sha, safe_join
from .version import LocalVersion, read_app_version, write_local

JOURNAL = ".update-journal.json"
BACKUPS = ".update-backup"
KEEP_BACKUPS = 2


class StagingInvalid(UpdaterError):
    def __init__(self, why: str):
        super().__init__(f"The downloaded update isn't complete ({why}). Nothing was changed; check for updates again to download it anew.")


class InstallFailed(UpdaterError):
    def __init__(self, why: str):
        super().__init__(f"The update couldn't be installed ({why}). Everything was put back as it was.")


class RollbackFailed(UpdaterError):
    def __init__(self, why: str, backup: str):
        self.backup = backup
        super().__init__(f"The update failed and putting the old files back also failed ({why}). "
                         f"Nothing in CaseVault-Data was touched. The old files are in {backup}; "
                         "copy them back into the CaseVault-App folder, or download the ZIP again.")


class NothingToUndo(UpdaterError):
    def __init__(self):
        super().__init__("There is no earlier version kept on this SSD to go back to.")


@dataclass
class InstallResult:
    commit: str
    app_version: str
    changed: int
    backup: str
    notes: List[str] = field(default_factory=list)


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def journal_path(settings: Settings) -> str:
    return os.path.join(settings.app_dir, JOURNAL)


def backups_root(settings: Settings) -> str:
    return os.path.join(settings.app_dir, BACKUPS)


def _write_json(path: str, data) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _read_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _put(src: str, dest: str) -> None:
    """Copy src over dest safely: written beside it first, then swapped in."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = f"{dest}.cvupdate"
    shutil.copyfile(src, tmp)
    with open(tmp, "rb+") as f:
        os.fsync(f.fileno())
    os.replace(tmp, dest)


def _remove(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    # Leave no empty folders behind (but never the area roots themselves).
    parent = os.path.dirname(path)
    try:
        while parent and not os.listdir(parent):
            os.rmdir(parent)
            parent = os.path.dirname(parent)
    except OSError:
        pass


def _roots(settings: Settings, tools_dir: Optional[str]):
    return {"app": settings.app_dir, "tools": tools_dir}


def _undo(steps: List[dict], backup: str, count: int) -> None:
    """Undo the first `count` steps, newest first. Raises on the first file that can't be restored."""
    for s in reversed(steps[:count]):
        target = s["target"]
        if s["existed"]:
            _put(os.path.join(backup, s["area"], *s["rel"].split("/")), target)
        else:
            _remove(target)


def _restore_version(backup: str, settings: Settings) -> None:
    saved = os.path.join(backup, "version.json")
    if os.path.exists(saved):
        _put(saved, settings.version_file)
    else:
        try:
            os.remove(settings.version_file)
        except FileNotFoundError:
            pass


def recover(settings: Settings) -> Optional[str]:
    """An install that was cut off (the journal is still there) is undone. Returns a message, or
    None when there was nothing to do."""
    path = journal_path(settings)
    j = _read_json(path)
    if not j:
        if os.path.exists(path):
            os.remove(path)  # a journal that can't be read can't be acted on
        return None
    if j.get("state") != "applying":
        os.remove(path)
        return None
    try:
        _undo(j["steps"], j["backup"], len(j["steps"]))  # every step: the count may be one behind
        _restore_version(j["backup"], settings)
    except (OSError, KeyError) as e:
        raise RollbackFailed(str(e), j.get("backup", "")) from e
    os.remove(path)
    return "An update was interrupted last time. The files it had changed were put back, so CaseVault is as it was before."


def _prune(settings: Settings, keep: int = KEEP_BACKUPS) -> None:
    root = backups_root(settings)
    try:
        names = sorted(n for n in os.listdir(root) if os.path.isdir(os.path.join(root, n)))
    except OSError:
        return
    for n in names[:-keep] if keep else names:
        shutil.rmtree(os.path.join(root, n), ignore_errors=True)


def install(settings: Settings, commit: str, tools_dir: Optional[str] = None,
            progress: Optional[Callable[[int, int, str], None]] = None) -> InstallResult:
    """Install the staged update for `commit` (see the module notes for the order of things)."""
    recover(settings)
    root = os.path.join(staging_root(settings), commit)
    manifest = read_manifest(root)
    if not manifest or manifest.get("commit") != commit:
        raise StagingInvalid("no finished download for this version")

    # 1. What goes where, and is every staged file intact?
    roots = _roots(settings, tools_dir)
    steps, notes = [], []
    for c in manifest["changes"]:
        area, rel, action = c.get("area"), c.get("rel", ""), c.get("action")
        if area not in roots or action not in (ADD, UPDATE, DELETE):
            raise StagingInvalid(f"an unknown change for {rel!r}")
        if roots[area] is None:
            notes.append(f"{rel} is for the CV-AI drive, which isn't plugged in; it was left out.")
            continue
        target = safe_join(roots[area], rel)
        staged = None
        if action != DELETE:
            staged = safe_join(os.path.join(root, area), rel)
            if file_blob_sha(staged) != c.get("sha"):
                raise StagingInvalid(f"{rel} is missing or damaged")
        steps.append({"action": action, "area": area, "rel": rel, "target": target, "staged": staged,
                      "existed": os.path.isfile(target)})

    # 2. Back up what will be replaced or removed.
    backup = os.path.join(backups_root(settings), f"{time.strftime('%Y%m%d-%H%M%S')}-{commit[:7]}")
    try:
        os.makedirs(backup, exist_ok=False)
        for s in steps:
            if s["existed"]:
                dest = os.path.join(backup, s["area"], *s["rel"].split("/"))
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                shutil.copy2(s["target"], dest)
        if os.path.exists(settings.version_file):
            shutil.copy2(settings.version_file, os.path.join(backup, "version.json"))
    except OSError as e:
        shutil.rmtree(backup, ignore_errors=True)
        raise InstallFailed(f"the backup couldn't be made: {e}") from e

    # 3. The journal: from here on, a cut-off install can be undone.
    jpath = journal_path(settings)
    journal = {"state": "applying", "commit": commit, "started": _now(), "backup": backup, "done": 0,
               "steps": [{k: s[k] for k in ("action", "area", "rel", "target", "existed")} for s in steps]}
    _write_json(jpath, journal)

    # 4. Apply.
    done = 0
    try:
        for i, s in enumerate(steps):
            if progress:
                progress(i, len(steps), s["rel"])
            if s["action"] == DELETE:
                _remove(s["target"])
            else:
                _put(s["staged"], s["target"])
            done = i + 1
            journal["done"] = done
            _write_json(jpath, journal)
        app_version = read_app_version(settings.app_dir)
        write_local(settings.version_file, LocalVersion(settings.repo_slug, settings.branch, commit, app_version, _now()))
    except Exception as e:  # noqa: BLE001 - whatever it was, put everything back
        try:
            _undo(journal["steps"], backup, min(done + 1, len(steps)))
            _restore_version(backup, settings)
        except OSError as e2:
            raise RollbackFailed(str(e2), backup) from e
        os.remove(jpath)
        raise InstallFailed(str(e) or e.__class__.__name__) from e
    if progress:
        progress(len(steps), len(steps), "")

    # 5. Done: the journal becomes the backup's record (for Undo), staging is cleared.
    journal["state"] = "done"
    journal["finished"] = _now()
    _write_json(os.path.join(backup, "journal.json"), journal)
    os.remove(jpath)
    shutil.rmtree(staging_root(settings), ignore_errors=True)
    _prune(settings)
    return InstallResult(commit, app_version, len(steps), backup, notes)


def last_backup(settings: Settings) -> Optional[str]:
    """The newest backup that records a finished install, or None."""
    root = backups_root(settings)
    try:
        names = sorted((n for n in os.listdir(root) if os.path.isfile(os.path.join(root, n, "journal.json"))), reverse=True)
    except OSError:
        return None
    return os.path.join(root, names[0]) if names else None


def undo_last(settings: Settings, progress: Optional[Callable[[int, int, str], None]] = None) -> str:
    """Put back the version from before the last update (its backup is then used up)."""
    recover(settings)
    backup = last_backup(settings)
    j = _read_json(os.path.join(backup, "journal.json")) if backup else None
    if not j or j.get("state") != "done":
        raise NothingToUndo()
    steps = j["steps"]
    try:
        for i, s in enumerate(reversed(steps)):
            if progress:
                progress(i, len(steps), s["rel"])
            if s["existed"]:
                _put(os.path.join(backup, s["area"], *s["rel"].split("/")), s["target"])
            else:
                _remove(s["target"])
        _restore_version(backup, settings)
    except OSError as e:
        raise RollbackFailed(str(e), backup) from e
    shutil.rmtree(backup, ignore_errors=True)
    rec_version = read_app_version(settings.app_dir)
    return f"The previous version{f' ({rec_version})' if rec_version else ''} is back in place."
