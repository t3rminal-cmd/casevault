# CaseVault Updater

A small updater that sits on the SSD with CaseVault (in `CaseVault-App\updater\`) and brings that
copy up to date from GitHub (`t3rminal-cmd/casevault`, branch `main`) when you ask it to. It never
runs on its own, and it never touches `CaseVault-Data`.

> **Status: step 1 of 4.** The version check works. It changes nothing yet.
> Next: the list of changed files and the download (step 2), applying with backup and rollback,
> including the W: tools (step 3), then the window with the Check for Updates button and progress bar (step 4).

## What it does when you check

1. Asks GitHub for the newest commit on `main` (one request to `api.github.com`; no login, the repository is public).
2. Reads `version.json` in the app folder: the commit the SSD copy was last updated to.
3. Tells you whether you're up to date, or what the newest version is (for example `1.22.0 → 1.23.0`).

A copy put on the SSD by hand (from the ZIP) has no `version.json` yet. The check says so and compares
version numbers; the install step will then compare every file and fetch only the ones that differ.

## Python on the SSD (no admin rights)

The updater uses only Python's standard library. `Check-For-Updates.bat` looks for Python in this order:

1. `updater\python\python.exe`: a portable Python kept on the SSD (recommended);
2. `py` or `python` already on the PC.

To put a portable Python on the SSD: run the python.org Windows installer, choose **Customize
installation**, untick **Install for all users** and **Add to PATH**, keep **tcl/tk** ticked (the
window in step 4 needs it), and set the location to `V:\CaseVault-App\updater\python`. It needs no
admin rights and changes nothing else on the PC. (The smaller "embeddable" Python zip has no tcl/tk, so
it can run the check but not the window.)

## Running the check

Double-click `Check-For-Updates.bat`, or from a command prompt in this folder:

    python -m casevault_updater check           # in words
    python -m casevault_updater check --json    # for scripts

Exit code 0 means up to date, 10 means an update is available (or it can't tell yet), 2 means an error.

## What goes online

Only when you run it, and only to `api.github.com` and `raw.githubusercontent.com`, over HTTPS, using
the PC's proxy and certificate settings. Nothing about you, the PC or any case is sent. GitHub allows
60 checks an hour from one network without a login.

## Settings

Nothing to set up. To test against another branch, create `updater\updater-settings.json`, e.g.
`{"branch": "dev"}` (also `owner`, `repo`, `app_dir`, `tools_dir`, `timeout`). No tokens are used.

## Tests

    python -m unittest discover -s updater/tests

They use a fake GitHub, so they run offline.
