"""Command line, for now:

    python -m casevault_updater check           the version check, in words
    python -m casevault_updater check --json    the same as JSON (for scripts)
    python -m casevault_updater plan            which files the update would change (changes nothing)
    python -m casevault_updater download        fetch and verify those files into .update-staging
                                                (CaseVault itself is still not touched)

Exit codes: 0 up to date, 10 update available (or can't tell), 2 error.
The window with the Check for Updates button and progress bar comes in a later step.
"""

import argparse
import json
import sys
from dataclasses import asdict

from . import __version__, config
from .download import download
from .errors import UpdaterError
from .github import GitHub
from .plan import plan_update
from .version import ERROR, UP_TO_DATE, check, read_local


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="casevault_updater", description="CaseVault Updater")
    p.add_argument("--version", action="version", version=f"CaseVault Updater {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check", help="Check GitHub for a newer CaseVault (changes nothing)")
    c.add_argument("--app-dir", help="The CaseVault-App folder (default: the updater's parent folder)")
    c.add_argument("--json", action="store_true", help="Print the result as JSON")
    for name, text in (("plan", "List the files an update would change (changes nothing)"),
                       ("download", "Download and verify the changed files into .update-staging")):
        c = sub.add_parser(name, help=text)
        c.add_argument("--app-dir", help="The CaseVault-App folder (default: the updater's parent folder)")
        c.add_argument("--tools-dir", help="The CV-AI drive root (default: found by Start-CaseVault.bat)")
        c.add_argument("--list", action="store_true", help="List every file")
    args = p.parse_args(argv)

    settings = config.load()
    if args.app_dir:
        from dataclasses import replace
        settings = replace(settings, app_dir=args.app_dir)

    if args.cmd == "check":
        r = check(settings)
        if args.json:
            print(json.dumps(asdict(r), indent=2))
        else:
            print(r.message)
        return 0 if r.state == UP_TO_DATE else 2 if r.state == ERROR else 10

    if getattr(args, "tools_dir", None):
        from dataclasses import replace
        settings = replace(settings, tools_dir=args.tools_dir)
    tools_dir = settings.tools_dir or config.find_tools_dir()
    gh = GitHub(settings.owner, settings.repo, timeout=settings.timeout)
    try:
        commit = gh.latest_commit(settings.branch)
        local, _ = read_local(settings.version_file)
        plan = plan_update(settings, gh, commit.sha, local.commit if local else None, tools_dir)
        for n in plan.notes:
            print(f"Note: {n}")
        print(f"Newest: commit {commit.short}. {plan.summary()}")
        if args.list:
            for c in plan.changes:
                print(f"  {c.action:<7} {c.area:<5} {c.rel}")
        if args.cmd == "download" and plan.downloads:
            def show(done, total, path):
                pct = 100 * done // total if total else 100
                print(f"\r  {pct:3d}%  {path[:60]:<60}", end="", flush=True)
            root = download(settings, gh, plan, tools_dir, progress=show)
            print(f"\nStaged in {root}. Nothing in CaseVault was changed.")
    except UpdaterError as e:
        print(str(e))
        return 2
    return 0 if plan.empty else 10


if __name__ == "__main__":
    sys.exit(main())
