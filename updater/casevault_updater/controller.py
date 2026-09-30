"""What the updater window does, without the window: the tests drive this directly.

The work runs on a background thread so the window stays responsive. Everything the window needs
to show arrives through post(kind, data), which the window turns into screen updates on its own
thread (tkinter isn't thread-safe). Kinds:

    "busy"      {"text": ...}                 a step started; buttons off
    "progress"  {"stage", "done", "total", "detail", "fraction"}
    "confirm"   {"summary", "files", "helper"} the download is ready: Install Now / Not Now
    "done"      {"ok": bool, "text", "notes": [...]}  finished (or nothing to do, or refused)
    "error"     {"text"}                      something went wrong; nothing half-done stays
    "local"     {"text"}                      what's on the SSD now (after each run)
"""

import threading
import time
from typing import Callable, Optional

from . import apps as default_apps
from . import config
from .errors import UpdaterError
from .install import last_backup, undo_last
from .version import read_app_version, read_local

STAGES = {
    "check": ("Checking GitHub for the newest version…", 0.00, 0.05),
    "plan": ("Comparing the files on this SSD…", 0.05, 0.20),
    "download": ("Downloading the changed files…", 0.20, 0.70),
    "stop": ("Closing the CaseVault helper…", 0.70, 0.75),
    "install": ("Installing (the old files are backed up first)…", 0.75, 0.95),
    "start": ("Starting CaseVault again…", 0.95, 1.00),
}


def _date(iso: str) -> str:
    try:
        return time.strftime("%m.%d.%Y", time.strptime(iso[:10], "%Y-%m-%d"))
    except ValueError:
        return ""


def local_text(settings: config.Settings) -> str:
    rec, note = read_local(settings.version_file)
    ver = read_app_version(settings.app_dir) or (rec.app_version if rec else "")
    if rec:
        when = _date(rec.updated_at)
        return f"This SSD has CaseVault {ver or '?'} (commit {rec.commit[:7]}{', updated ' + when if when else ''})."
    return f"This SSD has CaseVault {ver or '(version unknown)'}; it hasn't been updated with the updater yet."


class Controller:
    def __init__(self, settings: config.Settings, post: Callable[[str, dict], None], gh=None, apps=default_apps,
                 tools_dir: Optional[str] = None):
        self.settings, self.post, self.gh, self.apps, self.tools_dir = settings, post, gh, apps, tools_dir
        self._answer = threading.Event()
        self._yes = False
        self.thread: Optional[threading.Thread] = None
        self.installing = False

    # ---- state the window asks about
    @property
    def busy(self) -> bool:
        return bool(self.thread and self.thread.is_alive())

    def can_undo(self) -> bool:
        return last_backup(self.settings) is not None

    # ---- actions (called from the window's thread)
    def check(self) -> None:
        """Check for Updates: check → compare → download, then ask (post "confirm")."""
        if self.busy:
            return
        self.thread = threading.Thread(target=self._run_update, name="cv-update", daemon=True)
        self.thread.start()

    def answer(self, yes: bool) -> None:
        """Install Now (True) or Not Now (False), after a "confirm"."""
        self._yes = yes
        self._answer.set()

    def undo(self) -> None:
        if self.busy:
            return
        self.thread = threading.Thread(target=self._run_undo, name="cv-undo", daemon=True)
        self.thread.start()

    # ---- the work (background thread)
    def _progress(self, stage: str, done: int, total: int, detail: str) -> None:
        text, lo, hi = STAGES.get(stage, ("Working…", 0, 1))
        part = (done / total) if total else 0.0
        if stage == "install":
            self.installing = True
        self.post("progress", {"stage": stage, "text": text, "done": done, "total": total, "detail": detail,
                               "fraction": lo + (hi - lo) * min(1.0, max(0.0, part))})

    def _confirm(self, plan, running: bool) -> bool:
        files = [f"{c.action:<7} {'W: ' if c.area == 'tools' else ''}{c.rel}" for c in plan.changes]
        self._answer.clear()
        self.post("confirm", {"summary": plan.summary(), "files": files, "helper": running})
        self._answer.wait()
        return self._yes

    def _run_update(self) -> None:
        from .flow import run_update  # imported here so the window opens even if something is off
        self.installing = False
        self.post("busy", {"text": STAGES["check"][0]})
        try:
            out = run_update(self.settings, self._confirm, self._progress, gh=self.gh, tools_dir=self.tools_dir, apps=self.apps)
            self.post("done", {"ok": out.installed, "text": out.message, "notes": out.notes, "installed": out.installed})
        except UpdaterError as e:
            self.post("error", {"text": str(e)})
        except Exception as e:  # noqa: BLE001 - never leave the window hanging
            self.post("error", {"text": f"Something unexpected went wrong: {e}. If an install had started, it was put back."})
        finally:
            self.installing = False
            self.post("local", {"text": local_text(self.settings), "undo": self.can_undo()})

    def _run_undo(self) -> None:
        self.post("busy", {"text": "Putting back the previous version…"})
        running = self.apps.helper_running()
        tools = self.tools_dir or self.settings.tools_dir or config.find_tools_dir()
        try:
            if running and not self.apps.stop_helper(tools):
                self.post("error", {"text": "The CaseVault helper window couldn't be closed. Close it yourself and try again; nothing was changed."})
                return
            self.installing = True
            msg = undo_last(self.settings, progress=lambda d, n, p: self._progress("install", d, n, p))
            self.post("done", {"ok": True, "text": msg + (" CaseVault was started again." if running else " Reload CaseVault (F5) to use it."), "notes": []})
        except UpdaterError as e:
            self.post("error", {"text": str(e)})
        finally:
            self.installing = False
            if running:
                self.apps.start_helper(tools)
            self.post("local", {"text": local_text(self.settings), "undo": self.can_undo()})
