"""Save Problem Report (updater 1.3.2): the versions, the error and what happened; no case data."""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from test_install import InstallBase  # noqa: E402

from casevault_updater import __version__  # noqa: E402
from casevault_updater.report import report_text, save_report  # noqa: E402


class ReportTests(InstallBase):
    def test_text(self):
        log = [("busy", "Checking GitHub for the newest version…"), ("error", "Can't reach GitHub")]
        t = report_text(self.settings, log, "Can't reach GitHub", now=0)
        self.assertIn(f"Updater: {__version__}", t)
        self.assertIn("CaseVault on the SSD: 1.22.0 (commit aaaaaaa)", t)
        self.assertIn("Can't reach GitHub", t)
        self.assertIn("[busy] Checking GitHub", t)
        self.assertIn("No case data", t)

    def test_save(self):
        with tempfile.TemporaryDirectory() as d:
            path = save_report(self.settings, [], "boom", folder=d, now=0)
            self.assertTrue(os.path.isfile(path))
            self.assertTrue(os.path.basename(path).startswith("updater-problem-"))
            with open(path, encoding="utf-8") as f:
                self.assertIn("boom", f.read())


if __name__ == "__main__":
    unittest.main()
