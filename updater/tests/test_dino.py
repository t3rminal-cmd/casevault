"""The updater's running dinosaur (v1.33): its frames line up, and it runs without a display
when tkinter is there (skipped otherwise)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import tkinter  # noqa: F401
    HAVE_TK = True
except ImportError:
    HAVE_TK = False


@unittest.skipUnless(HAVE_TK, "tkinter isn't available")
class DinoFrames(unittest.TestCase):
    def test_frames(self):
        from casevault_updater import dino
        self.assertEqual(set(dino.FRAMES), {"run1", "run2", "stand"})
        for name, rows in dino.FRAMES.items():
            self.assertEqual(len(rows), 16, name)
            self.assertEqual({len(r) for r in rows}, {19}, name)
            self.assertTrue(any(k == 2 for _, _, k in dino.cells(name)), "it has an eye")
        self.assertNotEqual(dino.FRAMES["run1"][-2:], dino.FRAMES["run2"][-2:], "the legs move")


if __name__ == "__main__":
    unittest.main()
