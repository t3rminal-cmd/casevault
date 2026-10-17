"""What's New for the updater window (updater 1.3): read from the guide, newer than the SSD's version."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from casevault_updater.notes import plain, short, version_key, whats_new  # noqa: E402

GUIDE = """# Using CaseVault

Some text.

### What's new in v1.23

- **Timeline:** arrests sit under their suspect
- **Arrest Report:** no stray words, see [the guide](docs/x.md) and `vault.json`

### What's new in v1.22

- **Old:** something from before

### Another heading

- not a note
"""


class NotesTests(unittest.TestCase):
    def test_versions(self):
        self.assertEqual(version_key("1.143"), (1, 143, 0))
        self.assertGreater(version_key("1.143"), version_key("1.142.0"))
        self.assertGreater(version_key("1.100"), version_key("1.99"))
        self.assertEqual(short("1.143.0"), "1.143")
        self.assertEqual(short("1.143.1"), "1.143.1")

    def test_plain(self):
        self.assertEqual(plain("- **Title:** see [it](a.md) and `x`"), "Title: see it and x")

    def test_newer_than_installed(self):
        got = whats_new(GUIDE, "1.22.0")
        self.assertEqual([v for v, _ in got], ["1.23"])
        self.assertEqual(got[0][1][0], "Timeline: arrests sit under their suspect")
        self.assertEqual(got[0][1][1], "Arrest Report: no stray words, see the guide and vault.json")
        self.assertEqual([v for v, _ in whats_new(GUIDE, "1.21.0")], ["1.23", "1.22"])
        self.assertEqual(whats_new(GUIDE, "1.23.0"), [])

    def test_unknown_installed_shows_newest_only(self):
        self.assertEqual([v for v, _ in whats_new(GUIDE, "")], ["1.23"])

    def test_nothing_to_read(self):
        self.assertEqual(whats_new("", "1.0.0"), [])
        self.assertEqual(whats_new("# Just a title\n- a point", "1.0.0"), [])

    def test_the_real_guide(self):
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "USING-CASEVAULT.md")
        with open(path, encoding="utf-8") as f:
            got = whats_new(f.read(), "1.0.0")
        self.assertTrue(got, "the guide has What's new sections")
        self.assertTrue(all(points for _, points in got))
        self.assertTrue(all("**" not in p for _, points in got for p in points))


if __name__ == "__main__":
    unittest.main()
