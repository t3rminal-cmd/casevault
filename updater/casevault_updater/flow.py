"""The whole update, in the order the window (and `install` on the command line) runs it:

    recover an interrupted install → newest commit → plan → download (verified) → ask →
    stop the helper if it runs → install (backup, journal, rollback) → start the helper again

Nothing in CaseVault changes before the answer to "Install?" is yes. The steps report to
progress(stage, done, total, detail) so a window can show a bar; stage is one of
"check", "plan", "download", "stop", "install", "start".
"""

import time
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from . import apps as default_apps
from . import config
from .download import download
from .github import GitHub
from .install import InstallResult, install, recover
from .plan import Plan, plan_update
from .version import LocalVersion, read_app_version, read_local, write_local

Progress = Callable[[str, int, int, str], None]


@dataclass
class Outcome:
    installed: bool
    message: str
    plan: Optional[Plan] = None
    result: Optional[InstallResult] = None
    notes: List[str] = field(default_factory=list)


def run_update(settings: config.Settings, confirm: Callable[[Plan, bool], bool], progress: Optional[Progress] = None,
               gh: Optional[GitHub] = None, tools_dir: Optional[str] = None, apps=default_apps) -> Outcome:
    """confirm(plan, helper_running) is asked once, after the download and before any change."""
    gh = gh or GitHub(settings.owner, settings.repo, timeout=settings.timeout)
    step = progress or (lambda *a: None)
    notes = []
    msg = recover(settings)
    if msg:
        notes.append(msg)
    tools_dir = tools_dir or settings.tools_dir or config.find_tools_dir()

    step("check", 0, 1, "Asking GitHub for the newest version")
    commit = gh.latest_commit(settings.branch)
    local, _ = read_local(settings.version_file)
    step("plan", 0, 1, "Comparing the files on the SSD")
    plan = plan_update(settings, gh, commit.sha, local.commit if local else None, tools_dir,
                       progress=lambda d, n: step("plan", d, n, ""))
    notes.extend(plan.notes)
    if plan.empty:
        # Already the newest; make sure the record says so (a copy from the ZIP has none yet).
        if not local or local.commit != commit.sha:
            write_local(settings.version_file, LocalVersion(settings.repo_slug, settings.branch, commit.sha,
                                                            read_app_version(settings.app_dir), time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())))
        return Outcome(False, f"CaseVault is up to date ({read_app_version(settings.app_dir) or 'commit ' + commit.short}).", plan, notes=notes)

    download(settings, gh, plan, tools_dir, progress=lambda d, n, p: step("download", d, n, p))
    running = apps.helper_running()
    if not confirm(plan, running):
        return Outcome(False, "Not installed. The download is kept, so installing later is quick.", plan, notes=notes)

    if running:
        step("stop", 0, 1, "Stopping the CaseVault helper")
        if not apps.stop_helper(tools_dir):
            return Outcome(False, "The CaseVault helper window couldn't be closed. Close it yourself and install again; nothing was changed.", plan, notes=notes)
    result = None
    try:
        result = install(settings, commit.sha, tools_dir, progress=lambda d, n, p: step("install", d, n, p))
    finally:
        if running:
            step("start", 0, 1, "Starting CaseVault again")
            apps.start_helper(tools_dir)
    notes.extend(result.notes)
    after = "CaseVault was started again." if running else "Reload CaseVault (F5), or open it again, to use the new version."
    return Outcome(True, f"Installed {result.app_version or 'the update'} ({result.changed} file{'s' if result.changed != 1 else ''}). {after}", plan, result, notes)
