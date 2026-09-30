"""The version check, with a fake GitHub (no network). Run: python -m unittest discover -s updater/tests"""

import json
import os
import sys
import tempfile
import unittest
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from casevault_updater import config  # noqa: E402
from casevault_updater.errors import NoInternet  # noqa: E402
from casevault_updater.github import GitHub  # noqa: E402
from casevault_updater.version import (ERROR, UNKNOWN, UP_TO_DATE, UPDATE_AVAILABLE, LocalVersion,  # noqa: E402
                                       check, read_local, write_local)

OLD = "a" * 40
NEW = "b" * 40


def fake(commit=NEW, remote_app="1.23.0", status=200, headers=None, body=None, offline=False, raw_status=200):
    """A transport that answers like GitHub; records the URLs asked for."""
    calls = []

    def transport(url, hdrs, timeout):
        calls.append(url)
        assert hdrs["User-Agent"].startswith("CaseVault-Updater/")
        if offline:
            raise NoInternet("getaddrinfo failed")
        if url.startswith("https://api.github.com/repos/t3rminal-cmd/casevault/commits/"):
            if body is not None:
                return status, headers or {}, body
            data = {"sha": commit, "commit": {"message": "v1.23: something new\n\nDetails", "committer": {"date": "2026-10-02T10:00:00Z"}}}
            return status, headers or {}, json.dumps(data).encode()
        if url.startswith("https://raw.githubusercontent.com/t3rminal-cmd/casevault/"):
            return raw_status, {}, f"  const APP_VERSION = '{remote_app}';\n".encode()
        return 404, {}, b""

    transport.calls = calls
    return transport


class VersionCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = self.tmp.name
        os.makedirs(os.path.join(self.app, "js"))
        with open(os.path.join(self.app, "js", "vault.js"), "w", encoding="utf-8") as f:
            f.write("  const APP_VERSION = '1.22.0';\n")
        self.settings = replace(config.Settings(), app_dir=self.app)

    def tearDown(self):
        self.tmp.cleanup()

    def record(self, commit):
        write_local(self.settings.version_file, LocalVersion("t3rminal-cmd/casevault", "main", commit, "1.22.0", "2026-09-30T14:05:12Z"))

    def gh(self, **kw):
        t = fake(**kw)
        return GitHub("t3rminal-cmd", "casevault", transport=t), t

    def test_up_to_date(self):
        self.record(NEW)
        gh, t = self.gh()
        r = check(self.settings, gh)
        self.assertEqual(r.state, UP_TO_DATE)
        self.assertFalse(r.has_update)
        self.assertIn("up to date", r.message)
        self.assertTrue(t.calls[0].endswith("/commits/main"))

    def test_update_available_names_both_versions(self):
        self.record(OLD)
        gh, t = self.gh()
        r = check(self.settings, gh)
        self.assertEqual(r.state, UPDATE_AVAILABLE)
        self.assertTrue(r.has_update)
        self.assertIn("1.22.0 → 1.23.0", r.message)
        self.assertIn("commit bbbbbbb", r.message)
        self.assertIn("10.02.2026", r.message)
        self.assertIn("v1.23: something new", r.message)
        self.assertIn(f"/{NEW}/js/vault.js", t.calls[1], "the version number is read at the new commit")

    def test_missing_record_compares_version_numbers(self):
        gh, _ = self.gh(remote_app="1.22.0")
        r = check(self.settings, gh)
        self.assertEqual(r.state, UNKNOWN)
        self.assertEqual(r.local_note, "missing")
        self.assertIn("no version record yet", r.message)
        self.assertIn("same as the newest", r.message)

    def test_damaged_record_is_not_an_error(self):
        with open(self.settings.version_file, "w", encoding="utf-8") as f:
            f.write("{ not json")
        gh, _ = self.gh()
        r = check(self.settings, gh)
        self.assertEqual(r.state, UNKNOWN)
        self.assertEqual(r.local_note, "damaged")
        self.assertIn("damaged version record (1.22.0)", r.message)
        # A record whose commit id isn't a commit id is damaged too.
        with open(self.settings.version_file, "w", encoding="utf-8") as f:
            json.dump({"commit": "xyz"}, f)
        self.assertEqual(read_local(self.settings.version_file), (None, "damaged"))

    def test_no_internet(self):
        self.record(OLD)
        gh, _ = self.gh(offline=True)
        r = check(self.settings, gh)
        self.assertEqual(r.state, ERROR)
        self.assertIn("Can't reach GitHub", r.message)

    def test_rate_limit(self):
        gh, _ = self.gh(status=403, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790000000"}, body=b"{}")
        r = check(self.settings, gh)
        self.assertEqual(r.state, ERROR)
        self.assertIn("hourly limit", r.message)

    def test_wrong_branch_and_server_errors(self):
        gh, _ = self.gh(status=404, body=b"{}")
        self.assertIn("Not found on GitHub: branch 'main'", check(self.settings, gh).message)
        gh, _ = self.gh(status=502, body=b"")
        self.assertIn("(502)", check(self.settings, gh).message)

    def test_garbled_reply(self):
        gh, _ = self.gh(body=b"<html>captive portal</html>")
        r = check(self.settings, gh)
        self.assertEqual(r.state, ERROR)
        self.assertIn("unexpected", r.message)
        gh, _ = self.gh(body=json.dumps({"sha": "short", "commit": {}}).encode())
        self.assertIn("malformed commit id", check(self.settings, gh).message)

    def test_version_number_is_optional(self):
        self.record(OLD)
        gh, _ = self.gh(raw_status=404)
        r = check(self.settings, gh)
        self.assertEqual(r.state, UPDATE_AVAILABLE)
        self.assertEqual(r.remote_app_version, "")
        self.assertIn("1.22.0 → (commit bbbbbbb", r.message)

    def test_write_local_is_atomic_and_round_trips(self):
        self.record(NEW)
        self.assertFalse(os.path.exists(self.settings.version_file + ".tmp"))
        rec, note = read_local(self.settings.version_file)
        self.assertEqual((rec.commit, rec.app_version, note), (NEW, "1.22.0", "ok"))


class Config(unittest.TestCase):
    def test_repo_and_app_files(self):
        s = config.Settings()
        self.assertEqual((s.repo_slug, s.branch), ("t3rminal-cmd/casevault", "main"))
        for keep in ("index.html", "sw.js", "js/vault.js", "css/app.css", "docs/USING-CASEVAULT.md", "vendor/pdfjs/pdf.min.mjs"):
            self.assertTrue(config.is_app_file(keep, s), keep)
        for skip in (".github/workflows/pages.yml", "tests/drafts.test.js", "scripts/make-icons.js", "updater/casevault_updater/version.py", "tools/Start-CaseVault.bat", ".gitignore"):
            self.assertFalse(config.is_app_file(skip, s), skip)

    def test_settings_override(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "updater-settings.json")
            with open(p, "w", encoding="utf-8") as f:
                json.dump({"branch": "dev", "token": "never used", "timeout": 5}, f)
            s = config.load(p)
            self.assertEqual((s.branch, s.timeout, s.owner), ("dev", 5, "t3rminal-cmd"))
            self.assertFalse(hasattr(s, "token"))

    def test_find_tools_dir(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(config.find_tools_dir([d]))
            open(os.path.join(d, "Start-CaseVault.bat"), "w").close()
            os.makedirs(os.path.join(d, "casevault-helper"))
            self.assertEqual(config.find_tools_dir(["/nonexistent", d]), d)


if __name__ == "__main__":
    unittest.main()
