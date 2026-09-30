"""CaseVault Updater: brings the CaseVault copy on the SSD up to date from GitHub.

Only runs when you press "Check for Updates"; never on its own. Standard library only (no pip).

Modules
    config    where things are: the repo and branch, the app folder, the W: tools folder
    errors    the problems it can meet, each with a message for the window
    github    talks to api.github.com / raw.githubusercontent.com (read-only, no login)
    version   version.json on the SSD, and the check: is there a newer commit?
    (next)    plan (which files changed), download (to a staging folder, verified),
              apply (backup, replace, journal, roll back), processes (stop/start the helper),
              ui (the window with the button and progress bar)
"""

__version__ = "0.2.0"
