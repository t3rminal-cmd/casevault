"""The version record on the SSD (version.json in the app folder) and the update check.

version.json is written by the updater after each successful update:

    {
      "repo": "t3rminal-cmd/casevault",
      "branch": "main",
      "commit": "<40-character commit id the app folder matches>",
      "app_version": "1.22.0",
      "updated_at": "2026-09-30T14:05:12Z"
    }

The check compares that commit with the newest commit on GitHub. It changes nothing. A copy of
CaseVault put on the SSD by hand (from the ZIP) has no version.json yet; the check then says so
and compares app version numbers instead, and the install step (next) will compare file by file.
"""

import json
import os
import re
import time
from dataclasses import asdict, dataclass
from typing import Optional

from .config import Settings
from .errors import UpdaterError
from .github import Commit, GitHub

APP_VERSION_RE = re.compile(r"""APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]""")

# Check results
UP_TO_DATE = "up_to_date"
UPDATE_AVAILABLE = "update_available"
UNKNOWN = "unknown"            # no usable version.json: can't tell by commit alone
ERROR = "error"


@dataclass
class LocalVersion:
    repo: str = ""
    branch: str = ""
    commit: str = ""
    app_version: str = ""
    updated_at: str = ""


def read_local(path: str) -> "tuple[Optional[LocalVersion], str]":
    """(the record, a note). The record is None when the file is missing or damaged; the note
    says which (a damaged file is not an error: the next update rewrites it)."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return None, "missing"
    except (OSError, ValueError, UnicodeDecodeError):
        return None, "damaged"
    if not isinstance(data, dict):
        return None, "damaged"
    rec = LocalVersion(**{k: str(data.get(k, "") or "") for k in LocalVersion.__dataclass_fields__})
    if not re.fullmatch(r"[0-9a-f]{40}", rec.commit):
        return None, "damaged"
    return rec, "ok"


def write_local(path: str, rec: LocalVersion) -> None:
    """Write the record safely: to a temporary file first, then swapped in, so a power cut
    never leaves half a file."""
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(asdict(rec), f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def app_version_in(text: str) -> str:
    """The "1.22.0" in js/vault.js's APP_VERSION line, or ''."""
    m = APP_VERSION_RE.search(text or "")
    return m.group(1) if m else ""


def read_app_version(app_dir: str) -> str:
    try:
        with open(os.path.join(app_dir, "js", "vault.js"), "r", encoding="utf-8") as f:
            return app_version_in(f.read())
    except OSError:
        return ""


@dataclass
class CheckResult:
    state: str
    message: str
    local: Optional[LocalVersion] = None
    local_app_version: str = ""
    remote: Optional[Commit] = None
    remote_app_version: str = ""
    local_note: str = ""

    @property
    def has_update(self) -> bool:
        return self.state in (UPDATE_AVAILABLE, UNKNOWN)


def _date(iso: str) -> str:
    try:
        return time.strftime("%m.%d.%Y", time.strptime(iso[:10], "%Y-%m-%d"))
    except ValueError:
        return iso[:10]


def check(settings: Settings, gh: Optional[GitHub] = None) -> CheckResult:
    """Is there a newer CaseVault on GitHub than the one on the SSD? Changes nothing."""
    gh = gh or GitHub(settings.owner, settings.repo, timeout=settings.timeout)
    local, note = read_local(settings.version_file)
    local_app = read_app_version(settings.app_dir)
    try:
        remote = gh.latest_commit(settings.branch)
    except UpdaterError as e:
        return CheckResult(ERROR, str(e), local, local_app, local_note=note)

    # The newest app version number, for the message ("1.22.0 → 1.23.0"). Nice to have only.
    try:
        remote_app = app_version_in(gh.raw_file(remote.sha, "js/vault.js").decode("utf-8", "replace"))
    except UpdaterError:
        remote_app = ""

    newest = f"{remote_app + ' ' if remote_app else ''}(commit {remote.short}, {_date(remote.date)})"
    if local and local.commit == remote.sha:
        return CheckResult(UP_TO_DATE, f"CaseVault is up to date: {local_app or local.app_version or 'this version'} (commit {remote.short}).",
                           local, local_app, remote, remote_app, note)
    if local:
        frm = local_app or local.app_version or f"commit {local.commit[:7]}"
        return CheckResult(UPDATE_AVAILABLE, f"An update is available: {frm} → {newest}. {remote.message}".strip(),
                           local, local_app, remote, remote_app, note)
    # No usable version.json (copied from the ZIP, or damaged): compare version numbers.
    why = "has no version record yet" if note == "missing" else "has a damaged version record"
    if local_app and remote_app and local_app == remote_app:
        msg = (f"This copy {why}. It says {local_app}, the same as the newest {newest}; "
               "Install Update will compare every file and fetch only any that differ.")
    else:
        msg = (f"This copy {why}{f' ({local_app})' if local_app else ''}. The newest is {newest}; "
               "Install Update will compare every file and fetch only what differs.")
    return CheckResult(UNKNOWN, msg, None, local_app, remote, remote_app, note)
