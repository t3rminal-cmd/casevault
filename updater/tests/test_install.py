"""Installing a staged update: backup, rollback, recovery after a cut-off, undo. Fake GitHub, no network."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_plan import FILES_NEW, FILES_OLD, NEW, OLD, Base  # noqa: E402

from casevault_updater import install as inst  # noqa: E402
from casevault_updater.download import download, staging_dir, staging_root  # noqa: E402
from casevault_updater.flow import run_update  # noqa: E402
from casevault_updater.install import (InstallFailed, NothingToUndo, StagingInvalid, install, journal_path,  # noqa: E402
                                       last_backup, recover, undo_last)
from casevault_updater.version import LocalVersion, read_local, write_local  # noqa: E402


class FakeApps:
    def __init__(self, running=True, stops=True):
        self.running, self.stops, self.calls = running, stops, []

    def helper_running(self):
        return self.running

    def stop_helper(self, tools_dir):
        self.calls.append("stop")
        return self.stops

    def start_helper(self, tools_dir):
        self.calls.append("start")
        return True


class InstallBase(Base):
    def setUp(self):
        super().setUp()
        # The SSD was installed from the old commit by the updater (so removals are allowed).
        write_local(self.settings.version_file, LocalVersion("t3rminal-cmd/casevault", "main", OLD, "1.22.0", "2026-09-01T00:00:00Z"))

    def read(self, *parts):
        with open(os.path.join(*parts), "rb") as f:
            return f.read()

    def app(self, rel):
        return os.path.join(self.app, *rel.split("/"))

    def assert_old(self):
        self.assertEqual(self.read(self.app, "js", "vault.js"), FILES_OLD["js/vault.js"])
        self.assertEqual(self.read(self.app, "js", "gone.js"), FILES_OLD["js/gone.js"])
        self.assertFalse(os.path.exists(os.path.join(self.app, "js", "new.js")))
        self.assertEqual(self.read(self.tools, "Start-CaseVault.bat"), FILES_OLD["tools/Start-CaseVault.bat"])
        self.assertEqual(read_local(self.settings.version_file)[0].commit, OLD)

    def assert_new(self):
        self.assertEqual(self.read(self.app, "js", "vault.js"), FILES_NEW["js/vault.js"])
        self.assertEqual(self.read(self.app, "js", "new.js"), FILES_NEW["js/new.js"])
        self.assertFalse(os.path.exists(os.path.join(self.app, "js", "gone.js")))
        self.assertEqual(self.read(self.tools, "Start-CaseVault.bat"), FILES_NEW["tools/Start-CaseVault.bat"])
        rec = read_local(self.settings.version_file)[0]
        self.assertEqual((rec.commit, rec.app_version), (NEW, "1.23.0"))

    def staged(self):
        plan, gh, _ = self.plan()
        download(self.settings, gh, plan, self.tools, pause=0)
        return plan

    def run_flow(self, answer=True, apps=None, **kw):
        gh, _ = self.gh(**kw)
        apps = apps or FakeApps()
        asked = []
        out = run_update(self.settings, lambda plan, running: asked.append((plan.summary(), running)) or answer,
                         gh=gh, tools_dir=self.tools, apps=apps)
        return out, apps, asked


class Flow(InstallBase):
    def test_full_update_stops_installs_restarts(self):
        out, apps, asked = self.run_flow()
        self.assertTrue(out.installed, out.message)
        self.assert_new()
        self.assertEqual(apps.calls, ["stop", "start"])
        self.assertTrue(asked[0][1], "told the helper is running")
        self.assertIn("2 changed, 1 new, 1 to remove", asked[0][0])
        self.assertIn("Installed 1.23.0 (4 files). CaseVault was started again.", out.message)
        self.assertFalse(os.path.exists(journal_path(self.settings)))
        self.assertFalse(os.path.exists(staging_root(self.settings)), "staging cleared")
        self.assertTrue(last_backup(self.settings))
        # tests/ and updater/ in the repository never land on the SSD.
        self.assertFalse(os.path.exists(os.path.join(self.app, "tests")))
        self.assertFalse(os.path.exists(os.path.join(self.app, "updater", "casevault_updater", "x.py")))

    def test_saying_no_changes_nothing(self):
        out, apps, _ = self.run_flow(answer=False)
        self.assertFalse(out.installed)
        self.assertIn("download is kept", out.message)
        self.assert_old()
        self.assertEqual(apps.calls, [])
        self.assertTrue(os.path.exists(staging_dir(self.settings, NEW)))

    def test_helper_that_wont_stop(self):
        out, apps, _ = self.run_flow(apps=FakeApps(stops=False))
        self.assertFalse(out.installed)
        self.assertIn("couldn't be closed", out.message)
        self.assert_old()

    def test_edge_without_helper(self):
        out, apps, asked = self.run_flow(apps=FakeApps(running=False))
        self.assertTrue(out.installed)
        self.assertFalse(asked[0][1])
        self.assertEqual(apps.calls, [])
        self.assertIn("Reload CaseVault", out.message)

    def test_up_to_date_writes_the_record(self):
        self.run_flow()
        os.remove(self.settings.version_file)  # as a copy from the ZIP would be
        out, apps, asked = self.run_flow()
        self.assertFalse(out.installed)
        self.assertIn("up to date", out.message)
        self.assertEqual(asked, [])
        self.assertEqual(read_local(self.settings.version_file)[0].commit, NEW)

    def test_failed_install_restarts_helper_and_restores(self):
        real = inst._put
        calls = []

        def flaky(src, dest):
            calls.append(dest)
            if len(calls) == 2:
                raise OSError("The process cannot access the file because it is being used by another process")
            real(src, dest)
        inst._put = flaky
        try:
            with self.assertRaises(InstallFailed) as e:
                self.run_flow(apps=(apps := FakeApps()))
        finally:
            inst._put = real
        self.assertIn("put back as it was", str(e.exception))
        self.assertIn("used by another process", str(e.exception))
        self.assertEqual(apps.calls, ["stop", "start"], "CaseVault is started again even after a failure")
        self.assert_old()
        self.assertFalse(os.path.exists(journal_path(self.settings)))


class Safety(InstallBase):
    def test_damaged_staging_is_refused(self):
        self.staged()
        with open(os.path.join(staging_dir(self.settings, NEW), "app", "js", "vault.js"), "ab") as f:
            f.write(b"tampered")
        with self.assertRaises(StagingInvalid):
            install(self.settings, NEW, self.tools)
        self.assert_old()
        with self.assertRaises(StagingInvalid):
            install(self.settings, "c" * 40, self.tools)

    def test_power_cut_is_undone_next_time(self):
        self.staged()
        real = inst._put
        n = []

        def cut(src, dest):
            n.append(1)
            if len(n) == 3:
                raise KeyboardInterrupt  # stands for the power going off: nothing after runs
            real(src, dest)
        inst._put = cut
        try:
            with self.assertRaises(KeyboardInterrupt):
                install(self.settings, NEW, self.tools)
        finally:
            inst._put = real
        self.assertTrue(os.path.exists(journal_path(self.settings)), "the journal survives the cut")
        msg = recover(self.settings)
        self.assertIn("interrupted", msg)
        self.assert_old()
        self.assertIsNone(recover(self.settings))

    def test_undo_last_update(self):
        self.run_flow()
        self.assert_new()
        msg = undo_last(self.settings)
        self.assertIn("1.22.0", msg)
        self.assert_old()
        with self.assertRaises(NothingToUndo):
            undo_last(self.settings)

    def test_backups_are_pruned(self):
        self.run_flow()
        root = inst.backups_root(self.settings)
        for name in ("20200101-000000-aaaaaaa", "20210101-000000-bbbbbbb"):
            os.makedirs(os.path.join(root, name))
        inst._prune(self.settings)
        kept = sorted(os.listdir(root))
        self.assertEqual(len(kept), inst.KEEP_BACKUPS)
        self.assertNotIn("20200101-000000-aaaaaaa", kept, "the oldest goes first")

    def test_case_data_next_to_the_app_is_never_touched(self):
        data = os.path.join(os.path.dirname(self.app), "CaseVault-Data")
        os.makedirs(data)
        with open(os.path.join(data, "vault.json"), "w") as f:
            f.write("{}")
        self.run_flow()
        undo_last(self.settings)
        self.assertEqual(os.listdir(data), ["vault.json"])


if __name__ == "__main__":
    unittest.main()
