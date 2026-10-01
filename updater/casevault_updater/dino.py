"""An 8-bit dinosaur that runs along a little track while CaseVault is being updated (v1.33).

    Runner(parent, bg).run(fraction)   # it runs, and its place follows the progress (0..1)
    Runner.stand()                     # it stops where it is (idle, waiting, or after an error)
    Runner.finish()                    # it reaches the end and hops

Pixel art drawn with plain rectangles on a tkinter Canvas: no image files, standard library only.
The frames are kept as text so they can be checked without a display (see tests).
"""

import tkinter as tk
from typing import List, Optional

# '#' = body, '2' = eye. Two running frames (legs swap) and one standing frame, 19 wide x 16 high.
_BODY = [
    "...........#######",
    "..........##2######",
    "..........#########",
    "..........#########",
    "..........#####....",
    "..........########.",
    "#........######....",
    "##......#######....",
    "###....#########...",
    "####..##########...",
    "##############.#...",
    ".#############.....",
    "..###########......",
    "...#########.......",
]
FRAMES = {k: [row.ljust(19, ".") for row in rows] for k, rows in {
    "run1": _BODY + ["....###..##", "....##....##"],
    "run2": _BODY + ["....##...###", ".....##"],
    "stand": _BODY + ["....##...##", "....###..###"],
}.items()}
PIXEL = 3                 # each dot is 3x3 screen pixels
DINO_W = 19 * PIXEL + 1
DINO_H = 16 * PIXEL
TRACK_H = DINO_H + 18     # room to hop, and the ground line


def cells(frame: str) -> List[tuple]:
    """[(col, row, kind)] for one frame; kind 1 body, 2 eye."""
    out = []
    for r, line in enumerate(FRAMES[frame]):
        for col, ch in enumerate(line):
            if ch == "#":
                out.append((col, r, 1))
            elif ch == "2":
                out.append((col, r, 2))
    return out


class Runner:
    def __init__(self, parent: tk.Misc, bg: str = "#ffffff", ink: str = "#3b4652", ground: str = "#b8c0c9"):
        self.bg, self.ink, self.ground_color = bg, ink, ground
        self.canvas = tk.Canvas(parent, height=TRACK_H, bg=bg, highlightthickness=0, bd=0)
        self.fraction = 0.0
        self.shown = 0.0          # where it is drawn (eases towards fraction)
        self.mode = "stand"      # stand | run | finish
        self.step = 0
        self.hop = 0.0
        self.offset = 0          # ground scroll
        self._job: Optional[str] = None
        self.canvas.bind("<Configure>", lambda e: self._draw())

    # ---- what the window calls
    def pack(self, **kw) -> None:
        self.canvas.pack(**kw)

    def run(self, fraction: float) -> None:
        self.fraction = min(1.0, max(0.0, float(fraction)))
        if self.mode != "run":
            self.mode = "run"
            self._tick()

    def stand(self) -> None:
        self.mode = "stand"
        self._draw()

    def finish(self) -> None:
        self.fraction = 1.0
        self.mode = "finish"
        self.hop = 0.0
        self._tick()

    def reset(self) -> None:
        self.fraction = self.shown = 0.0
        self.mode = "stand"
        self._draw()

    # ---- animation
    def _tick(self) -> None:
        if self._job:
            try:
                self.canvas.after_cancel(self._job)
            except tk.TclError:
                pass
            self._job = None
        if not self.canvas.winfo_exists():
            return
        self.step += 1
        self.shown += (self.fraction - self.shown) * 0.12
        if self.mode == "run":
            self.offset = (self.offset + 4) % 24
        elif self.mode == "finish":
            self.hop += 1
            if self.hop > 24:          # one hop, then stand at the end
                self.mode = "stand"
        self._draw()
        if self.mode != "stand":
            self._job = self.canvas.after(70, self._tick)

    def _draw(self) -> None:
        c = self.canvas
        try:
            c.delete("all")
            w = max(c.winfo_width(), 200)
        except tk.TclError:
            return
        ground_y = TRACK_H - 6
        # The ground: a line and little stones that scroll while it runs.
        c.create_line(0, ground_y, w, ground_y, fill=self.ground_color, width=2)
        for x in range(-self.offset, w, 24):
            c.create_rectangle(x + 6, ground_y + 3, x + 9, ground_y + 4, fill=self.ground_color, outline="")
            c.create_rectangle(x + 17, ground_y + 2, x + 18, ground_y + 3, fill=self.ground_color, outline="")
        # The finish flag at the far end.
        fx = w - 10
        c.create_line(fx, ground_y, fx, ground_y - 26, fill=self.ink, width=2)
        c.create_polygon(fx, ground_y - 26, fx - 12, ground_y - 22, fx, ground_y - 18, fill="#198754", outline="")
        # The dinosaur.
        frame = "stand" if self.mode == "stand" else ("run1" if self.step % 2 else "run2")
        lift = 0
        if self.mode == "finish":
            t = min(self.hop, 24) / 24.0
            lift = int(16 * 4 * t * (1 - t))       # a little parabola
        x0 = int(4 + self.shown * max(0, w - DINO_W - 30))
        y0 = ground_y - DINO_H - lift
        for col, row, kind in cells(frame):
            x, y = x0 + col * PIXEL, y0 + row * PIXEL
            c.create_rectangle(x, y, x + PIXEL, y + PIXEL, fill=self.bg if kind == 2 else self.ink, outline="")
