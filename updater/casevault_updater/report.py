"""Save Problem Report (updater 1.3.2): a small text file to send to the developer when an update
fails. It holds what the updater did and the error, and the versions; never anything from
CaseVault-Data (the updater never reads it). Saved in the updater folder, in problem-reports\\.
"""

import os
import platform
import sys
import time
from typing import Iterable, Optional, Tuple

from . import __version__, config
from .version import read_app_version, read_local

FOLDER = "problem-reports"


def report_text(settings: config.Settings, log: Iterable[Tuple[str, str]], error: str, now: Optional[float] = None) -> str:
    """The report: when, the versions, the error, then what the updater did (kind and text)."""
    t = time.localtime(now if now is not None else time.time())
    rec, note = read_local(settings.version_file)
    lines = [
        "CaseVault Updater: problem report",
        f"Made: {time.strftime('%Y-%m-%d %H:%M:%S', t)}",
        f"Updater: {__version__}",
        f"CaseVault on the SSD: {read_app_version(settings.app_dir) or 'unknown'}"
        + (f" (commit {rec.commit[:7]})" if rec else f" (version record {note})"),
        f"Repository: {settings.repo_slug} ({settings.branch})",
        f"Python: {sys.version.split()[0]} on {platform.system()} {platform.release()}",
        "",
        "Error:",
        f"  {error or '(none)'}",
        "",
        "What the updater did (newest last):",
    ]
    lines += [f"  [{kind}] {text}" for kind, text in list(log)[-60:]] or ["  (nothing yet)"]
    lines += ["", "No case data is in this file: the updater never reads CaseVault-Data."]
    return "\n".join(lines) + "\n"


def report_dir(settings: config.Settings) -> str:
    """problem-reports\\ next to the updater's own files (CaseVault-App\\updater)."""
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), FOLDER)


def save_report(settings: config.Settings, log, error: str, folder: Optional[str] = None, now: Optional[float] = None) -> str:
    """Write the report; -> its full path."""
    d = folder or report_dir(settings)
    os.makedirs(d, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime(now if now is not None else time.time()))
    path = os.path.join(d, f"updater-problem-{stamp}.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(report_text(settings, log, error, now))
    return path
