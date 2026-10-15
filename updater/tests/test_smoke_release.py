"""Smoke test: install this repository's real files over an older copy with the real updater code.

A fake GitHub (no network) serves the files in this checkout as the new commit; the SSD starts with
an older, smaller copy. After plan, download and install, the app folder must be a working CaseVault.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from casevault_updater import config  # noqa: E402
from casevault_updater.download import download  # noqa: E402
from casevault_updater.github import GitHub  # noqa: E402
from casevault_updater.install import install  # noqa: E402
from casevault_updater.plan import blob_sha, make_plan  # noqa: E402
from casevault_updater.version import LocalVersion, read_local, write_local  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OLD = "a" * 40
NEW = "b" * 40


def repo_files():
    try:
        out = subprocess.run(["git", "ls-files", "-z"], cwd=REPO, capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    files = {}
    for p in out.decode("utf-8").split("\0"):
        full = os.path.join(REPO, *p.split("/")) if p else ""
        if p and os.path.isfile(full):
            with open(full, "rb") as f:
                files[p] = f.read()
    return files


def tree_json(files):
    return json.dumps({"truncated": False, "tree": [
        {"path": p, "type": "blob", "mode": "100644", "sha": blob_sha(d), "size": len(d)} for p, d in files.items()]}).encode()


def fake(new_files, old_files):
    api = "https://api.github.com/repos/t3rminal-cmd/casevault/"
    raw = "https://raw.githubusercontent.com/t3rminal-cmd/casevault/"

    def transport(url, hdrs, timeout):
        if url.startswith(api + "commits/"):
            return 200, {}, json.dumps({"sha": NEW, "commit": {"message": "release", "committer": {"date": "2026-10-15T10:00:00Z"}}}).encode()
        if url.startswith(api + "git/trees/"):
            sha = url[len(api + "git/trees/"):].split("?")[0]
            return 200, {}, tree_json(new_files if sha == NEW else old_files)
        if url.startswith(raw):
            sha, path = url[len(raw):].split("/", 1)
            files = new_files if sha == NEW else old_files
            return (200, {}, files[path]) if path in files else (404, {}, b"")
        return 404, {}, b""

    return transport


@unittest.skipIf(repo_files() is None, "needs a git checkout of the repository")
class SmokeRelease(unittest.TestCase):
    def setUp(self):
        self.new = repo_files()
        self.tmp = tempfile.TemporaryDirectory()
        self.app = os.path.join(self.tmp.name, "CaseVault-App")
        self.tools = os.path.join(self.tmp.name, "W")
        self.settings = replace(config.Settings(), app_dir=self.app)
        # The older version on the SSD: an earlier app version, a stale stylesheet, a file since removed,
        # and no theme or bundled font yet.
        self.old = {p: d for p, d in self.new.items()
                    if not p.startswith("vendor/jetbrains-mono/") and p != "css/theme.css"}
        self.old["js/vault.js"] = re.sub(rb"APP_VERSION = '[^']*'", b"APP_VERSION = '1.100.0'", self.new["js/vault.js"])
        self.old["css/app.css"] = b"/* old stylesheet */\n"
        self.old["js/retired-module.js"] = b"// removed in the new version\n"
        for p, d in self.old.items():
            where = self.place(p)
            if where:
                os.makedirs(os.path.dirname(where), exist_ok=True)
                with open(where, "wb") as f:
                    f.write(d)
        write_local(self.settings.version_file, LocalVersion("t3rminal-cmd/casevault", "main", OLD, "1.100.0", "2026-09-01T00:00:00Z"))

    def tearDown(self):
        self.tmp.cleanup()

    def place(self, p):
        if p.startswith("tools/"):
            return os.path.join(self.tools, *p[len("tools/"):].split("/"))
        if config.is_app_file(p, self.settings):
            return os.path.join(self.app, *p.split("/"))
        return None

    def test_release_installs_as_a_working_casevault(self):
        gh = GitHub("t3rminal-cmd", "casevault", transport=fake(self.new, self.old))
        plan = make_plan(self.settings, NEW, gh.tree(NEW), gh.tree(OLD), self.tools)
        self.assertTrue(plan.changes)
        download(self.settings, gh, plan, self.tools, pause=0)
        result = install(self.settings, NEW, self.tools)

        # Every app and tools file arrived byte for byte; the removed file is gone.
        app_files = [p for p in self.new if self.place(p)]
        self.assertGreater(len(app_files), 100)
        for p in app_files:
            with open(self.place(p), "rb") as f:
                self.assertEqual(f.read(), self.new[p], p)
        self.assertFalse(os.path.exists(os.path.join(self.app, "js", "retired-module.js")))
        self.assertTrue(os.path.isfile(os.path.join(self.app, "css", "theme.css")))
        self.assertTrue(os.listdir(os.path.join(self.app, "vendor", "jetbrains-mono")))
        # Tests and CI files never go onto the SSD.
        self.assertFalse(os.path.exists(os.path.join(self.app, "tests")))
        self.assertFalse(os.path.exists(os.path.join(self.app, ".github")))

        # The version record matches the release's APP_VERSION.
        version = re.search(rb"APP_VERSION = '([^']+)'", self.new["js/vault.js"]).group(1).decode()
        rec = read_local(self.settings.version_file)[0]
        self.assertEqual((rec.commit, rec.app_version, result.app_version), (NEW, version, version))

        # Everything the offline service worker caches is in the installed app.
        sw = self.new["sw.js"].decode("utf-8")
        listed = re.findall(r"'\./([^']+)'", sw[sw.index("const APP_FILES"):sw.index("];", sw.index("const APP_FILES"))])
        self.assertGreater(len(listed), 50)
        missing = [p for p in listed if not os.path.isfile(os.path.join(self.app, *p.split("/")))]
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
