"""The updater window's logic (controller) with a fake GitHub; the window itself when tkinter and a
display are there (skipped otherwise, e.g. in CI)."""

import os
import queue
import sys
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_install import FakeApps, InstallBase  # noqa: E402

from casevault_updater.controller import Controller, local_text  # noqa: E402


class Events:
    def __init__(self):
        self.q = queue.Queue()
        self.seen = []

    def post(self, kind, data):
        self.seen.append((kind, data))
        self.q.put((kind, data))

    def wait_for(self, kind, timeout=10):
        while True:
            k, d = self.q.get(timeout=timeout)
            if k == kind:
                return d

    def kinds(self):
        return [k for k, _ in self.seen]


class ControllerTests(InstallBase):
    def make(self, apps=None, **kw):
        gh, _ = self.gh(**kw)
        ev = Events()
        ctl = Controller(self.settings, ev.post, gh=gh, apps=apps or FakeApps(), tools_dir=self.tools)
        return ctl, ev

    def test_check_then_install(self):
        ctl, ev = self.make()
        self.assertFalse(ctl.can_undo())
        ctl.check()
        c = ev.wait_for("confirm")
        self.assertIn("2 changed, 2 new, 1 to remove", c["summary"])
        self.assertTrue(c["helper"])
        self.assertIn("update  W: Start-CaseVault.bat", c["files"])
        self.assert_old()  # nothing changed while asking
        ctl.answer(True)
        d = ev.wait_for("done")
        self.assertTrue(d["installed"])
        self.assertIn("Installed 1.23.0", d["text"])
        loc = ev.wait_for("local")
        self.assertIn("CaseVault 1.23.0 (commit bbbbbbb", loc["text"])
        self.assertTrue(loc["undo"])
        ctl.thread.join(5)
        self.assert_new()
        # The bar only moves forward.
        fr = [d["fraction"] for k, d in ev.seen if k == "progress"]
        self.assertEqual(fr, sorted(fr))
        self.assertGreater(fr[-1], 0.9)

    def test_not_now(self):
        ctl, ev = self.make()
        ctl.check()
        ev.wait_for("confirm")
        ctl.answer(False)
        d = ev.wait_for("done")
        self.assertFalse(d["installed"])
        self.assertIn("Not installed", d["text"])
        ctl.thread.join(5)
        self.assert_old()

    def test_error_is_shown_not_raised(self):
        ctl, ev = self.make(apps=FakeApps(stops=False))
        ctl.check()
        ev.wait_for("confirm")
        ctl.answer(True)
        d = ev.wait_for("done")
        self.assertIn("couldn't be closed", d["text"])
        ctl, ev = self.make()
        ctl.gh.transport = lambda *a: (_ for _ in ()).throw(__import__("casevault_updater.errors", fromlist=["x"]).NoInternet("offline"))
        ctl.check()
        self.assertIn("Can't reach GitHub", ev.wait_for("error")["text"])

    def test_undo_from_the_window(self):
        ctl, ev = self.make()
        ctl.check()
        ev.wait_for("confirm")
        ctl.answer(True)
        ev.wait_for("local")
        ctl.thread.join(5)
        apps = FakeApps()
        ctl.apps = apps
        ctl.undo()
        d = ev.wait_for("done")
        self.assertIn("previous version (1.22.0) is back", d["text"])
        ev.wait_for("local")
        ctl.thread.join(5)
        self.assertEqual(apps.calls, ["stop", "start"])
        self.assert_old()

    def test_local_text(self):
        self.assertIn("CaseVault 1.22.0 (commit aaaaaaa, updated 09.01.2026)", local_text(self.settings))
        os.remove(self.settings.version_file)
        self.assertIn("hasn't been updated with the updater yet", local_text(self.settings))


def _tk_ok():
    try:
        import tkinter
        r = tkinter.Tk()
        r.destroy()
        return True
    except Exception:  # noqa: BLE001 - no tkinter, or no display
        return False


@unittest.skipUnless(_tk_ok(), "tkinter or a display isn't available")
class WindowTests(InstallBase):
    def test_window_flow(self):
        import tkinter as tk
        from casevault_updater.window import UpdaterWindow
        gh, _ = self.gh()
        root = tk.Tk()
        w = UpdaterWindow(root, self.settings)
        w.ctl.gh, w.ctl.apps, w.ctl.tools_dir = gh, FakeApps(), self.tools
        seen = []

        def until(cond, limit=400):
            for _ in range(limit):
                root.update()
                if cond():
                    return True
                threading.Event().wait(0.02)
            return False

        w.on_check()
        self.assertTrue(until(lambda: w.waiting), "Install Now is offered")
        self.assertIn("Ready to install", w.status.cget("text"))
        self.assertTrue(w.install_btn.winfo_ismapped())
        w.on_answer(True)
        self.assertTrue(until(lambda: not w.ctl.busy and "Installed" in w.status.cget("text")))
        seen.append(w.status.cget("text"))
        self.assertEqual(int(w.bar["value"]), 1000)
        self.assertIn("1.23.0", w.local.cget("text"))
        root.destroy()
        self.assert_new()


if __name__ == "__main__":
    unittest.main()
