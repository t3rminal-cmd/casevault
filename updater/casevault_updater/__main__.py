"""Command line, for now:

    python -m casevault_updater check           the version check, in words
    python -m casevault_updater check --json    the same as JSON (for scripts)

Exit codes: 0 up to date, 10 update available (or can't tell), 2 error.
The window with the Check for Updates button and progress bar comes in a later step.
"""

import argparse
import json
import sys
from dataclasses import asdict

from . import __version__, config
from .version import ERROR, UP_TO_DATE, check


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="casevault_updater", description="CaseVault Updater")
    p.add_argument("--version", action="version", version=f"CaseVault Updater {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check", help="Check GitHub for a newer CaseVault (changes nothing)")
    c.add_argument("--app-dir", help="The CaseVault-App folder (default: the updater's parent folder)")
    c.add_argument("--json", action="store_true", help="Print the result as JSON")
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
    return 2


if __name__ == "__main__":
    sys.exit(main())
