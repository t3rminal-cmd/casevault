"""The plan (which files differ) and the staged download, with a fake GitHub (no network)."""

import json
import os
import sys
import tempfile
import unittest
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from casevault_updater import config  # noqa: E402
from casevault_updater.download import CorruptDownload, DiskFull, download, read_manifest, staging_dir  # noqa: E402
from casevault_updater.errors import BadResponse  # noqa: E402
from casevault_updater.github import GitHub, TreeEntry  # noqa: E402
from casevault_updater.plan import ADD, DELETE, UPDATE, UnsafePath, blob_sha, file_blob_sha, make_plan, safe_join  # noqa: E402

OLD = "a" * 40
NEW = "b" * 40

# Synthetic repository contents at two commits.
FILES_OLD = {
    "index.html": b"<!doctype html><title>CaseVault</title>\n",
    "js/vault.js": b"const APP_VERSION = '1.22.0';\n",
    "js/gone.js": b"// removed in the new version\n",
    "tools/Start-CaseVault.bat": b"@echo off\r\necho old\r\n",
    "tests/x.test.js": b"test\n",
}
FILES_NEW = {
    "index.html": b"<!doctype html><title>CaseVault</title>\n",
    "js/vault.js": b"const APP_VERSION = '1.23.0';\n",
    "js/new.js": b"// new file\n",
    "tools/Start-CaseVault.bat": b"@echo off\r\necho new\r\n",
    "tests/x.test.js": b"test 2\n",
    "updater/casevault_updater/x.py": b"# the updater's own new file: goes to updater/_next\n",
    "updater/tests/test_x.py": b"# never copied\n",
    "updater/Check-For-Updates.bat": b"@echo off\r\n",
}


def tree_json(files, truncated=False):
    return json.dumps({"truncated": truncated, "tree": [{"path": "js", "type": "tree", "sha": "c" * 40}] + [
        {"path": p, "type": "blob", "mode": "100644", "sha": blob_sha(d), "size": len(d)} for p, d in files.items()]}).encode()


def fake(corrupt=None, truncated=False):
    """corrupt: {path: times} - that file arrives damaged that many times first."""
    corrupt = dict(corrupt or {})
    calls = []

    def transport(url, hdrs, timeout):
        calls.append(url)
        api = "https://api.github.com/repos/t3rminal-cmd/casevault/git/trees/"
        raw = "https://raw.githubusercontent.com/t3rminal-cmd/casevault/"
        if url.startswith("https://api.github.com/repos/t3rminal-cmd/casevault/commits/"):
            return 200, {}, json.dumps({"sha": NEW, "commit": {"message": "v1.23", "committer": {"date": "2026-10-02T10:00:00Z"}}}).encode()
        if url.startswith(api):
            sha = url[len(api):].split("?")[0]
            return 200, {}, tree_json(FILES_NEW if sha == NEW else FILES_OLD, truncated)
        if url.startswith(raw):
            sha, path = url[len(raw):].split("/", 1)
            files = FILES_NEW if sha == NEW else FILES_OLD
            if path not in files:
                return 404, {}, b""
            if corrupt.get(path):
                corrupt[path] -= 1
                return 200, {}, b"<html>proxy error</html>"
            return 200, {}, files[path]
        return 404, {}, b""

    transport.calls = calls
    return transport


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = os.path.join(self.tmp.name, "CaseVault-App")
        self.tools = os.path.join(self.tmp.name, "W")
        # The SSD holds the old version.
        for p, d in FILES_OLD.items():
            if p.startswith("tests/"):
                continue
            full = os.path.join(self.tools, p[len("tools/"):]) if p.startswith("tools/") else os.path.join(self.app, *p.split("/"))
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "wb") as f:
                f.write(d)
        self.settings = replace(config.Settings(), app_dir=self.app)

    def tearDown(self):
        self.tmp.cleanup()

    def gh(self, **kw):
        t = fake(**kw)
        return GitHub("t3rminal-cmd", "casevault", transport=t), t

    def plan(self, old=True, tools=True, **kw):
        gh, t = self.gh(**kw)
        return make_plan(self.settings, NEW, gh.tree(NEW), gh.tree(OLD) if old else None, self.tools if tools else None), gh, t


class PlanTests(Base):
    def test_blob_sha_matches_git(self):
        # `printf 'hello\n' | git hash-object --stdin`
        self.assertEqual(blob_sha(b"hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a")
        p = os.path.join(self.tmp.name, "h.txt")
        with open(p, "wb") as f:
            f.write(b"hello\n")
        self.assertEqual(file_blob_sha(p), "ce013625030ba8dba906f756967f9e9ca394464a")
        self.assertIsNone(file_blob_sha(os.path.join(self.tmp.name, "missing")))

    def test_only_changed_files(self):
        plan, _, _ = self.plan()
        got = {(c.action, c.area, c.rel) for c in plan.changes}
        self.assertEqual(got, {(UPDATE, "app", "js/vault.js"), (ADD, "app", "js/new.js"),
                               (UPDATE, "tools", "Start-CaseVault.bat"), (DELETE, "app", "js/gone.js"),
                               (ADD, "updater", "casevault_updater/x.py")})
        self.assertEqual(plan.unchanged, 1)  # index.html
        self.assertIn("2 changed, 2 new, 1 to remove", plan.summary())
        upd = [c for c in plan.changes if c.area == "updater"][0]
        self.assertEqual(upd.target, os.path.join(self.app, "updater", "_next", "casevault_updater", "x.py"))

    def test_updater_file_already_running_is_unchanged(self):
        live = os.path.join(self.app, "updater", "casevault_updater", "x.py")
        os.makedirs(os.path.dirname(live), exist_ok=True)
        with open(live, "wb") as f:
            f.write(FILES_NEW["updater/casevault_updater/x.py"])
        plan, _, _ = self.plan()
        self.assertFalse(any(c.area == "updater" for c in plan.changes))
        self.assertEqual(plan.unchanged, 2)
        tools = [c for c in plan.changes if c.area == "tools"][0]
        self.assertEqual(tools.target, os.path.join(self.tools, "Start-CaseVault.bat"))

    def test_nothing_removed_without_previous_record(self):
        plan, _, _ = self.plan(old=False)
        self.assertEqual(plan.of(DELETE), [])
        self.assertTrue(any("No record" in n for n in plan.notes))

    def test_tools_skipped_when_drive_missing(self):
        plan, _, _ = self.plan(tools=False)
        self.assertFalse(any(c.area == "tools" for c in plan.changes))
        self.assertTrue(any("CV-AI drive" in n for n in plan.notes))

    def test_up_to_date(self):
        for p, d in FILES_NEW.items():
            if p.startswith("tests/") or (p.startswith("updater/") and not config.is_updater_file(p)):
                continue
            full = os.path.join(self.tools, p[6:]) if p.startswith("tools/") else os.path.join(self.app, *p.split("/"))
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "wb") as f:
                f.write(d)
        os.remove(os.path.join(self.app, "js", "gone.js"))
        plan, _, _ = self.plan()
        self.assertTrue(plan.empty)
        self.assertIn("already matches", plan.summary())

    def test_unsafe_paths_refused(self):
        for bad in ("../evil.js", "/etc/passwd", "js/../../x", "C:/x", "js\\x", "", "a//b"):
            with self.assertRaises(UnsafePath, msg=bad):
                safe_join(self.app, bad)
        self.assertEqual(safe_join(self.app, "js/vault.js"), os.path.join(self.app, "js", "vault.js"))
        entry = [TreeEntry("../outside.js", blob_sha(b"x"), 1)]
        with self.assertRaises(UnsafePath):
            make_plan(self.settings, NEW, entry, None, None)

    def test_truncated_tree_refused(self):
        gh, _ = self.gh(truncated=True)
        with self.assertRaises(BadResponse):
            gh.tree(NEW)


class DownloadTests(Base):
    def test_download_stages_and_verifies(self):
        plan, gh, t = self.plan()
        seen = []
        root = download(self.settings, gh, plan, self.tools, progress=lambda d, n, p: seen.append((d, n)), pause=0)
        self.assertEqual(root, staging_dir(self.settings, NEW))
        with open(os.path.join(root, "app", "js", "vault.js"), "rb") as f:
            self.assertEqual(f.read(), FILES_NEW["js/vault.js"])
        with open(os.path.join(root, "tools", "Start-CaseVault.bat"), "rb") as f:
            self.assertEqual(f.read(), FILES_NEW["tools/Start-CaseVault.bat"])
        self.assertEqual(seen[-1], (plan.download_bytes, plan.download_bytes))
        m = read_manifest(root)
        self.assertEqual(m["commit"], NEW)
        self.assertEqual(len(m["changes"]), 5)
        # CaseVault itself is untouched.
        with open(os.path.join(self.app, "js", "vault.js"), "rb") as f:
            self.assertEqual(f.read(), FILES_OLD["js/vault.js"])
        self.assertTrue(os.path.exists(os.path.join(self.app, "js", "gone.js")))
        # Only the changed files were fetched.
        raws = [u for u in t.calls if "raw.githubusercontent" in u]
        self.assertEqual(len(raws), 4)

    def test_resume_skips_files_already_staged(self):
        plan, gh, t = self.plan()
        download(self.settings, gh, plan, self.tools, pause=0)
        before = len(t.calls)
        download(self.settings, gh, plan, self.tools, pause=0)
        self.assertEqual(len(t.calls), before, "a second run fetches nothing")

    def test_damaged_file_is_fetched_again(self):
        plan, gh, t = self.plan(corrupt={"js/vault.js": 2})
        root = download(self.settings, gh, plan, self.tools, pause=0)
        self.assertEqual(file_blob_sha(os.path.join(root, "app", "js", "vault.js")), blob_sha(FILES_NEW["js/vault.js"]))

    def test_always_damaged_stops(self):
        plan, gh, _ = self.plan(corrupt={"js/vault.js": 99})
        with self.assertRaises(CorruptDownload) as e:
            download(self.settings, gh, plan, self.tools, pause=0)
        self.assertIn("js/vault.js", str(e.exception))
        self.assertIsNone(read_manifest(staging_dir(self.settings, NEW)), "no manifest: staging incomplete")

    def test_disk_full(self):
        import casevault_updater.download as dl
        plan, gh, _ = self.plan()
        real = dl._free
        dl._free = lambda p: 1024
        try:
            with self.assertRaises(DiskFull):
                download(self.settings, gh, plan, self.tools, pause=0)
        finally:
            dl._free = real

    def test_stale_staging_removed(self):
        stale = staging_dir(self.settings, OLD)
        os.makedirs(stale)
        plan, gh, _ = self.plan()
        download(self.settings, gh, plan, self.tools, pause=0)
        self.assertFalse(os.path.exists(stale))


if __name__ == "__main__":
    unittest.main()
