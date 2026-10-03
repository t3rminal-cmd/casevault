"""The CaseVault Updater window: one Check for Updates button and a progress bar.

    Check for Updates → (checks, compares, downloads only what changed; nothing is changed yet)
    → "Ready to install: …" with the list of files → Install Now / Not Now
    → progress while it backs up, installs and restarts CaseVault → the result.

Standard library only (tkinter). The work runs in controller.Controller on a background thread;
this file only draws what it posts.
"""

import os
import queue
import sys
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Optional

from . import __version__, config
from .controller import Controller, local_text

BLUE = "#0d6efd"
GREEN = "#198754"
RED = "#b02a37"
MUTED = "#5c6670"
FONT = "Consolas"
BG = "#f6f8fb"
CARD = "#ffffff"
BORDER = "#dfe3e8"



HERO = ("#0b3d91", "#0d6efd", "#3d8bfd")  # the Overview banner's blues, left to right


def _mix(a: str, b: str, t: float) -> str:
    """The colour t of the way from a to b (#rrggbb)."""
    pa = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    pb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(pa, pb))


def hero_color(x: float, width: float) -> str:
    """The banner's colour at x: dark blue fading to bright blue (v1.51)."""
    t = 0.0 if width <= 0 else max(0.0, min(1.0, x / width))
    return _mix(HERO[0], HERO[1], t / 0.55) if t < 0.55 else _mix(HERO[1], HERO[2], (t - 0.55) / 0.45)


class HeroHeader:
    """v1.51: a blue band like the Overview banner in CaseVault: the title and the version in white on
    the left. v1.57 (updater 1.2.1): nothing on the right (the shield and rings are gone)."""

    def __init__(self, parent: tk.Misc, title: str, sub: str, height: int = 92):
        self.c = tk.Canvas(parent, height=height, highlightthickness=0, bd=0, bg=HERO[0])
        self.title, self.sub, self.h = title, sub, height
        self.c.bind("<Configure>", lambda e: self.draw())

    def pack(self, **kw) -> None:
        self.c.pack(**kw)

    def configure(self, text: str) -> None:
        self.sub = text
        self.draw()

    def draw(self) -> None:
        c, h = self.c, self.h
        w = max(c.winfo_width(), 200)
        c.delete("all")
        for x in range(0, w, 2):
            c.create_rectangle(x, 0, x + 2, h, fill=hero_color(x, w), outline="")
        c.create_text(22, 26, text=self.title, anchor="w", fill="#ffffff", font=(FONT, 16, "bold"))
        c.create_text(22, 56, text=self.sub, anchor="nw", fill="#dbe8ff", font=(FONT, 9), width=max(200, w - 44))

class UpdaterWindow:
    def __init__(self, root: tk.Tk, settings: config.Settings, controller: Optional[Controller] = None):
        self.root = root
        self.settings = settings
        self.events: "queue.Queue" = queue.Queue()
        self.ctl = controller or Controller(settings, lambda kind, data: self.events.put((kind, data)))
        self.waiting = False  # a "confirm" is on screen

        root.title("CaseVault Updater")
        root.configure(bg=BG)
        root.minsize(600, 500)
        root.geometry("640x540")
        self._style()

        # v1.51: the blue banner (like CaseVault's Overview) across the top, without the logo.
        self.local = HeroHeader(root, "CaseVault Updater", local_text(settings))
        self.local.pack(fill="x")
        outer = tk.Frame(root, bg=BG, padx=18, pady=16)
        outer.pack(fill="both", expand=True)

        card = tk.Frame(outer, bg=CARD, highlightbackground=BORDER, highlightthickness=1, padx=16, pady=14)
        card.pack(fill="both", expand=True, pady=(0, 12))
        self.status = tk.Label(card, text="Press Check for Updates to see whether a newer CaseVault is on GitHub. Nothing is changed until you say Install.",
                               bg=CARD, font=(FONT, 10), anchor="w", justify="left", wraplength=520)
        self.status.pack(fill="x")
        self.bar = ttk.Progressbar(card, mode="determinate", maximum=1000, style="CV.Horizontal.TProgressbar")
        self.bar.pack(fill="x", pady=(12, 4))
        row = tk.Frame(card, bg=CARD)
        row.pack(fill="x")
        self.detail = tk.Label(row, text="", bg=CARD, fg=MUTED, font=(FONT, 8), anchor="w")
        self.detail.pack(side="left", fill="x", expand=True)
        self.pct = tk.Label(row, text="", bg=CARD, fg=MUTED, font=(FONT, 8), anchor="e")
        self.pct.pack(side="right")

        listbox = tk.Frame(card, bg=CARD)
        self.files = tk.Text(listbox, height=6, wrap="none", font=("Consolas", 9), relief="flat", bg=BG, fg="#212529",
                             highlightthickness=1, highlightbackground=BORDER, padx=8, pady=6)
        sb = ttk.Scrollbar(listbox, orient="vertical", command=self.files.yview)
        self.files.configure(yscrollcommand=sb.set, state="disabled")
        self.files.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self.listbox = listbox

        foot = tk.Frame(outer, bg=BG)
        foot.pack(fill="x", side="bottom", before=card)  # buttons always visible; the card takes what is left
        self.undo_btn = ttk.Button(foot, text="Undo Last Update", style="Link.TButton", command=self.on_undo)
        self.check_btn = ttk.Button(foot, text="Check for Updates", style="Primary.TButton", command=self.on_check)
        self.install_btn = ttk.Button(foot, text="Install Now", style="Primary.TButton", command=lambda: self.on_answer(True))
        self.later_btn = ttk.Button(foot, text="Not Now", command=lambda: self.on_answer(False))
        self.close_btn = ttk.Button(foot, text="Close", command=self.on_close)
        self.close_btn.pack(side="right")
        self.check_btn.pack(side="right", padx=(0, 8))
        self._undo_state(self.ctl.can_undo())

        self.footer = tk.Label(outer, text=f"Updater {__version__} · reads github.com/{settings.repo_slug} · CaseVault-Data is never touched",
                 bg=BG, fg=MUTED, font=(FONT, 7))
        self.footer.pack(anchor="w", pady=(8, 0), side="bottom", before=foot)  # packed first = lowest

        root.protocol("WM_DELETE_WINDOW", self.on_close)
        root.bind("<Return>", lambda e: self._default())
        root.after(60, self._pump)

    # ---------------------------------------------------------------- look
    def _style(self) -> None:
        s = ttk.Style(self.root)
        if "vista" in s.theme_names():
            s.theme_use("vista")
        elif "clam" in s.theme_names():
            s.theme_use("clam")
        s.configure("CV.Horizontal.TProgressbar", troughcolor="#e9edf2", background=BLUE, thickness=14, borderwidth=0)
        s.configure("Primary.TButton", font=(FONT, 10, "bold"), padding=(14, 6))
        s.configure("TButton", font=(FONT, 10), padding=(12, 6))
        s.configure("Link.TButton", font=(FONT, 9), padding=(4, 4), relief="flat")
        if self.root.tk.call("tk", "windowingsystem") != "win32":
            s.configure("Primary.TButton", foreground="white", background=BLUE)
            s.map("Primary.TButton", background=[("disabled", "#9ec5fe"), ("active", "#0b5ed7")])

    def _undo_state(self, on: bool) -> None:
        """Undo Last Update shows only when there is an earlier version to go back to."""
        if on:
            self.undo_btn.state(["!disabled"])
            if not self.undo_btn.winfo_ismapped():
                self.undo_btn.pack(side="left")
        else:
            self.undo_btn.pack_forget()

    def _say(self, text: str, color: str = "#212529") -> None:
        self.status.configure(text=text, fg=color)

    def _buttons(self, mode: str) -> None:
        """idle: Check for Updates · confirm: Not Now + Install Now · busy: nothing to press"""
        for b in (self.check_btn, self.install_btn, self.later_btn):
            b.pack_forget()
        if mode == "idle":
            self.check_btn.pack(side="right", padx=(0, 8))
            self.check_btn.state(["!disabled"])
            self.close_btn.state(["!disabled"])
        elif mode == "confirm":
            self.install_btn.pack(side="right", padx=(0, 8))
            self.later_btn.pack(side="right", padx=(0, 8))
            self.close_btn.state(["!disabled"])
        else:
            self.check_btn.pack(side="right", padx=(0, 8))
            self.check_btn.state(["disabled"])
            self.close_btn.state(["disabled"])
            self.undo_btn.state(["disabled"])

    def _show_files(self, lines) -> None:
        self.files.configure(state="normal")
        self.files.delete("1.0", "end")
        self.files.insert("end", "\n".join(lines))
        self.files.configure(state="disabled")
        if lines:
            self.listbox.pack(fill="both", expand=True, pady=(10, 0))
        else:
            self.listbox.pack_forget()

    def _default(self) -> None:
        if self.waiting:
            self.on_answer(True)
        elif not self.ctl.busy:
            self.on_check()

    # ---------------------------------------------------------------- buttons
    def on_check(self) -> None:
        self._show_files([])
        self.bar["value"] = 0
        self.pct.configure(text="")
        self.detail.configure(text="")
        self._buttons("busy")
        self.ctl.check()

    def on_answer(self, yes: bool) -> None:
        if not self.waiting:
            return
        self.waiting = False
        self._buttons("busy")
        if yes:
            self._say("Installing…")
        self.ctl.answer(yes)

    def on_undo(self) -> None:
        if self.ctl.busy:
            return
        if not messagebox.askyesno("Undo Last Update", "Put back the version of CaseVault from before the last update?\n\n"
                                   "Close CaseVault in the browser first. Your cases are not affected.", parent=self.root):
            return
        self._show_files([])
        self._buttons("busy")
        self.ctl.undo()

    def on_close(self) -> None:
        if self.ctl.installing:
            messagebox.showinfo("Please wait", "The update is being installed. The window closes when it's safe; this takes a moment.", parent=self.root)
            return
        if self.waiting:
            self.ctl.answer(False)  # "Not Now": nothing was changed
        self.root.destroy()

    # ---------------------------------------------------------------- events from the controller
    def _pump(self) -> None:
        try:
            while True:
                kind, data = self.events.get_nowait()
                self.handle(kind, data)
        except queue.Empty:
            pass
        if self.root.winfo_exists():
            self.root.after(60, self._pump)

    def handle(self, kind: str, data: dict) -> None:
        if kind == "busy":
            self._say(data["text"])
        elif kind == "progress":
            self._say(data["text"])
            self.bar["value"] = int(1000 * data["fraction"])
            self.pct.configure(text=f"{int(100 * data['fraction'])}%")
            self.detail.configure(text=data.get("detail", "")[:80])
        elif kind == "confirm":
            self.waiting = True
            how = ("The CaseVault helper window will be closed and started again."
                   if data["helper"] else "Close CaseVault in the browser (Edge or Firefox) first, and reload it afterwards.")
            self._say(f"Ready to install: {data['summary']}\nDownloaded and checked; nothing has been changed yet. {how}", BLUE)
            self.detail.configure(text="")
            self._show_files(data["files"])
            self._buttons("confirm")
            self.install_btn.focus_set()
        elif kind == "done":
            self.bar["value"] = 1000 if data.get("installed") else self.bar["value"]
            if data.get("installed"):
                self.pct.configure(text="100%")
            self.detail.configure(text="")
            notes = "\n".join(f"• {n}" for n in data.get("notes", []))
            self._say(data["text"] + (f"\n{notes}" if notes else ""), GREEN if data.get("ok") else "#212529")
            self._show_files([])
            self._buttons("idle")
        elif kind == "error":
            self.detail.configure(text="")
            self._say(data["text"], RED)
            self._show_files([])
            self._buttons("idle")
        elif kind == "local":
            self.local.configure(text=data["text"])
            self._undo_state(bool(data.get("undo")))
            if not self.ctl.busy:
                self._buttons("idle")
                self._undo_state(bool(data.get("undo")))


def main(app_dir: Optional[str] = None) -> int:
    settings = config.load()
    if app_dir:
        from dataclasses import replace
        settings = replace(settings, app_dir=app_dir)
    root = tk.Tk()
    try:
        icon = os.path.join(settings.app_dir, "icons", "icon-192.png")
        if os.path.isfile(icon):
            root.iconphoto(True, tk.PhotoImage(file=icon))
    except tk.TclError:
        pass
    UpdaterWindow(root, settings)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
