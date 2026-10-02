# CaseVault Updater

A small updater that sits on the SSD with CaseVault (in `CaseVault-App\updater\`) and brings that
copy up to date from GitHub (`t3rminal-cmd/casevault`, branch `main`) when you ask it to. It never
runs on its own, and it never touches `CaseVault-Data`.

## The window (how you'll normally use it)

Double-click **`Check-For-Updates.bat`** in `V:\CaseVault-App\updater\`. The **CaseVault Updater**
window opens with a blue banner (v1.2: like the Overview banner in CaseVault, with a shield and
padlock) that shows which version the SSD has.

1. **Check for Updates**: it checks GitHub, compares every file on the SSD and downloads only the
   ones that changed. The progress bar moves; nothing in CaseVault is changed yet.
2. If there is an update, it says what will change (the list of files) and offers **Install Now** or
   **Not Now**. Not Now keeps the download, so installing later is quick.
3. **Install Now**: it closes the CaseVault helper window if it runs (Firefox), backs up the files it
   replaces, installs, and starts the helper again. With Edge, close CaseVault first and reload it
   afterwards (the window says which).
4. The result shows in green, or in red with what went wrong (everything is put back).

**The updater updates itself (v1.35).** Its own new files (the `casevault_updater` folder and this
README) are put in `updater\_next`, because a running program can't safely replace itself. The next
time you start `Check-For-Updates.bat`, it moves them into place before the window opens, and
`_next` is removed. `updater\python`, the tests and `Check-For-Updates.bat` itself are never changed
this way (copy a new `.bat` from the ZIP if one is ever needed).

**Undo Last Update** (bottom left, after an update) puts the previous version back. The window can't
be closed while files are being installed. It never runs on its own: only when you open it.

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

## Updating from a command prompt

Double-click **`Update-CaseVault.bat`** in `V:\CaseVault-App\updater\` (or run
`python -m casevault_updater install`). It:

1. undoes an update that was cut off last time (power cut, SSD pulled out), if any;
2. asks GitHub for the newest version and compares every file on the SSD with it;
3. downloads only the files that differ, checking each one (see below). Nothing is changed yet;
4. says what it will change and asks **Install now?** Answer `n` and nothing changes (the download
   is kept, so installing later is quick);
5. closes the CaseVault helper window if it is running (Firefox) and the Ollama it started from the
   CV-AI drive. With Edge on its own, close the CaseVault window yourself first;
6. copies every file it will replace or remove to `.update-backup\<time>-<commit>\`, writes a journal,
   then puts the new files in place one by one;
7. writes `version.json`, and starts the helper again (it opens CaseVault in the browser). In Edge,
   reload CaseVault (F5).

If anything fails during step 6, everything already changed is put back from the backup and you're
told what went wrong. **`Update-CaseVault.bat undo`** (or `python -m casevault_updater undo`) puts back
the version from before the last update. The two newest backups are kept. `CaseVault-Data` (the
cases) is never read or written by the updater.

## Which files, and the download

    python -m casevault_updater plan --list      # the files that differ (changes nothing)
    python -m casevault_updater download         # fetch them into .update-staging (CaseVault untouched)

The plan fingerprints every file on the SSD the way Git does (the "blob id") and compares it with the
fingerprints GitHub lists for the newest commit (one request). Only files that differ are fetched, so an
update is usually a few hundred KB. `tools/` in the repository goes to the CV-AI drive (found by its
`Start-CaseVault.bat` and `casevault-helper` folder); `.github/`, `tests/`, `scripts/` and `updater/`
go nowhere. A file is removed only when the previously recorded version had it and the new one
doesn't, so a copy without `version.json` never loses a file.

Each downloaded file is fingerprinted again as it arrives; a damaged one is fetched again (three
tries), then the download stops with nothing changed. Space for the files plus a backup is checked
first. A download that was interrupted picks up where it stopped. When everything is in,
`.update-staging\<commit>\manifest.json` lists what the install step will do.

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
