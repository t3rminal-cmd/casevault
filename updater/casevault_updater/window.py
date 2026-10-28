"""The CaseVault Updater window (updater 1.3: dressed like CaseVault; 1.3.1: a small, plain popup;
1.4: neutral and quiet).

    Check for Updates → (checks, compares, downloads only what changed; nothing is changed yet)
    → "Installed 1.142 → Available 1.143" with What's New (the file list behind Show Files)
    → Install Now / Not Now → progress while it backs up, installs and restarts CaseVault
    → Done, with Open CaseVault.

1.4 keeps it minimal and neutral: a plain light header with the title (and "Working…" while it works;
no animation), the version line, one line of status, a thin progress bar and the buttons. Greys with
a charcoal main button, thin borders, square corners, 11 pt text and 12 pt headings. What's New (and
the list of files) opens only when you press What's New. (The four steps are still tracked, for the
tests, but not drawn.)

Standard library only (tkinter). The work runs in controller.Controller on a background thread;
this file only draws what it posts.
"""

import os
import queue
import sys
import tkinter as tk
from tkinter import messagebox, ttk
from typing import List, Optional, Tuple

from . import __version__, config
from .controller import Controller, local_text
from .notes import short
from .version import read_app_version

# 1.4: neutral greys. NAVY is the main colour (now charcoal), kept under its old name for the code
# that uses it; green and red only say "done" and "stopped".
NAVY = "#2f3437"
NAVY_HOVER = "#454b4f"
GREEN = "#3c6e4f"
RED = "#a63a32"
TEXT = "#202325"
MUTED = "#6b7074"
BG = "#f4f4f3"
CARD = "#ffffff"
SOFT = "#ececea"
BORDER = "#d6d6d3"
FONT = "Consolas"
BODY = 11      # text
SMALL = 10     # details under the bar, the footer
HEAD = 12      # headings and the version strip

STEPS = ("Check", "Download", "Install", "Done")
STAGE_STEP = {"check": 0, "plan": 0, "download": 1, "stop": 2, "install": 2, "start": 2}


class HeroHeader:
    """1.4: a plain header: the title on the left, "Working…" on the right while the updater works
    (no animation), a thin line under it. spinning / spin() keep their names for the window's code
    and the tests. cget("text") is what's on the SSD (shown on hover)."""

    def __init__(self, parent: tk.Misc, title: str, sub: str, height: int = 48):
        self.c = tk.Frame(parent, bg=CARD, height=height)
        self.c.pack_propagate(False)
        self.title, self.sub = title, sub
        self.spinning = False
        tk.Label(self.c, text=title, bg=CARD, fg=TEXT, font=(FONT, 13, "bold"), anchor="w").pack(side="left", padx=18)
        self.state = tk.Label(self.c, text="", bg=CARD, fg=MUTED, font=(FONT, SMALL), anchor="e")
        self.state.pack(side="right", padx=18)
        self.line = tk.Frame(parent, bg=BORDER, height=1)

    def pack(self, **kw) -> None:
        self.c.pack(**kw)
        self.line.pack(fill="x")

    def cget(self, key: str) -> str:
        return self.sub if key == "text" else self.c.cget(key)

    def configure(self, text: str) -> None:
        self.sub = text

    def spin(self, on: bool) -> None:
        self.spinning = bool(on)
        self.state.configure(text="Working…" if on else "")


class Steps:
    """Check · Download · Install · Done: a square for each, navy while it runs, green when done,
    red where it stopped."""

    def __init__(self, parent: tk.Misc):
        self.c = tk.Canvas(parent, height=46, highlightthickness=0, bd=0, bg=CARD)
        self.active, self.done, self.failed = -1, -1, False
        self.c.bind("<Configure>", lambda e: self.draw())

    def pack(self, **kw) -> None:
        self.c.pack(**kw)

    def set(self, active: int, done: int, failed: bool = False) -> None:
        self.active, self.done, self.failed = active, done, failed
        self.draw()

    def state_of(self, i: int) -> str:
        if i <= self.done:
            return "done"
        if i == self.active:
            return "failed" if self.failed else "active"
        return "todo"

    def draw(self) -> None:
        c = self.c
        w = max(c.winfo_width(), 300)
        c.delete("all")
        box = 22
        slot = w / len(STEPS)
        for i, name in enumerate(STEPS):
            x = slot * i + slot / 2
            if i:
                px = x - slot
                c.create_line(px + box / 2 + 6, 13, x - box / 2 - 6, 13, fill=GREEN if i <= self.done else BORDER, width=2)
            st = self.state_of(i)
            fill, line, fg = {"done": (GREEN, GREEN, "#ffffff"), "active": (NAVY, NAVY, "#ffffff"),
                              "failed": (RED, RED, "#ffffff"), "todo": (CARD, BORDER, MUTED)}[st]
            c.create_rectangle(x - box / 2, 2, x + box / 2, 2 + box, fill=fill, outline=line, width=2)
            c.create_text(x, 13, text={"done": "✓", "failed": "!"}.get(st, str(i + 1)), fill=fg, font=(FONT, SMALL, "bold"))
            c.create_text(x, 36, text=name, fill=MUTED if st == "todo" else TEXT,
                          font=(FONT, SMALL, "bold" if st in ("active", "failed") else "normal"))


def flat_button(parent: tk.Misc, text: str, command, primary: bool = False, small: bool = False) -> tk.Button:
    """A square, flat button in the app's colours (navy for the main action)."""
    if primary:
        colours = dict(bg=NAVY, fg="#ffffff", activebackground=NAVY_HOVER, activeforeground="#ffffff", disabledforeground="#b8c3d1")
    else:
        colours = dict(bg=CARD, fg=TEXT, activebackground=SOFT, activeforeground=TEXT, disabledforeground="#a8acb2")
    return tk.Button(parent, text=text, command=command, relief="flat", bd=0, cursor="hand2",
                     highlightthickness=1, highlightbackground=NAVY if primary else BORDER,
                     font=(FONT, SMALL if small else BODY, "bold" if primary else "normal"),
                     padx=10 if small else 16, pady=3 if small else 7, **colours)


class UpdaterWindow:
    def __init__(self, root: tk.Tk, settings: config.Settings, controller: Optional[Controller] = None):
        self.root = root
        self.settings = settings
        self.events: "queue.Queue" = queue.Queue()
        self.ctl = controller or Controller(settings, lambda kind, data: self.events.put((kind, data)))
        self.waiting = False  # a "confirm" is on screen
        self.finished = False  # the Done screen (Open CaseVault) is on screen
        self.news: List[Tuple[str, List[str]]] = []
        self.file_lines: List[str] = []
        self.showing_files = False
        self.panel_open = False  # 1.3.1: What's New shows only when asked for
        self.log: List[Tuple[str, str]] = []  # 1.3.2: what happened, for Save Problem Report
        self.last_error = ""

        root.title("CaseVault Updater")
        root.configure(bg=BG)
        root.minsize(560, 0)  # 1.3.1: as tall as what it shows, no taller
        self._style()

        self.local = HeroHeader(root, "CaseVault Updater", local_text(settings))
        self.local.pack(fill="x")
        outer = tk.Frame(root, bg=BG, padx=18, pady=14)
        outer.pack(fill="both", expand=True)

        # The version strip: Installed 1.142 → Available 1.143.
        strip = tk.Frame(outer, bg=BG)
        strip.pack(fill="x", pady=(0, 10))
        self.v_have = tk.Label(strip, text="", bg=CARD, fg=MUTED, font=(FONT, HEAD), padx=12, pady=6,
                               highlightthickness=1, highlightbackground=BORDER)
        self.v_have.pack(side="left")
        self.v_arrow = tk.Label(strip, text="→", bg=BG, fg=MUTED, font=(FONT, HEAD, "bold"), padx=8)
        self.v_new = tk.Label(strip, text="", bg=CARD, fg=TEXT, font=(FONT, HEAD, "bold"), padx=12, pady=6,
                              highlightthickness=1, highlightbackground=NAVY)
        self.news_btn = flat_button(strip, "What's New", self.toggle_panel, small=True)
        self._versions(read_app_version(settings.app_dir), None)

        card = tk.Frame(outer, bg=CARD, highlightbackground=BORDER, highlightthickness=1, padx=16, pady=12)
        card.pack(fill="x", pady=(0, 12))
        self.steps = Steps(card)  # 1.3.1: kept for its state, not drawn
        self.status = tk.Label(card, text="Press Check for Updates to see whether a newer CaseVault is on GitHub. Nothing is changed until you say Install.",
                               bg=CARD, fg=TEXT, font=(FONT, BODY), anchor="w", justify="left", wraplength=520)
        self.status.pack(fill="x")
        card.bind("<Configure>", lambda e: self.status.configure(wraplength=max(300, e.width - 40)))
        self.bar = ttk.Progressbar(card, mode="determinate", maximum=1000, style="CV.Horizontal.TProgressbar")
        self.bar.pack(fill="x", pady=(10, 4))
        row = tk.Frame(card, bg=CARD)
        row.pack(fill="x")
        self.detail = tk.Label(row, text="", bg=CARD, fg=MUTED, font=(FONT, SMALL), anchor="w")
        self.detail.pack(side="left", fill="x", expand=True)
        self.pct = tk.Label(row, text="", bg=CARD, fg=MUTED, font=(FONT, SMALL), anchor="e")
        self.pct.pack(side="right")

        # What's New, with the list of files behind Show Files.
        panel = tk.Frame(card, bg=CARD)
        head = tk.Frame(panel, bg=CARD)
        head.pack(fill="x", pady=(0, 4))
        self.panel_title = tk.Label(head, text="What's New", bg=CARD, fg=TEXT, font=(FONT, HEAD, "bold"), anchor="w")
        self.panel_title.pack(side="left")
        self.files_btn = flat_button(head, "Show Files", self.toggle_files, small=True)
        body = tk.Frame(panel, bg=CARD)
        body.pack(fill="both", expand=True)
        self.files = tk.Text(body, height=8, wrap="word", font=(FONT, BODY), relief="flat", bg=SOFT, fg=TEXT,
                             highlightthickness=1, highlightbackground=BORDER, padx=10, pady=8, spacing1=2, spacing3=2)
        self.files.tag_configure("ver", font=(FONT, HEAD, "bold"), foreground=TEXT, spacing1=6, spacing3=4)
        self.files.tag_configure("point", lmargin1=6, lmargin2=22)
        self.files.tag_configure("title", font=(FONT, BODY, "bold"))
        self.files.tag_configure("mono", font=(FONT, SMALL), wrap="none")
        sb = ttk.Scrollbar(body, orient="vertical", command=self.files.yview)
        self.files.configure(yscrollcommand=sb.set, state="disabled")
        self.files.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self.listbox = panel

        foot = tk.Frame(outer, bg=BG)
        foot.pack(fill="x", side="bottom", before=card)  # buttons always visible; the card takes what is left
        self.undo_btn = flat_button(foot, "Undo Last Update", self.on_undo, small=True)
        self.check_btn = flat_button(foot, "Check for Updates", self.on_check, primary=True)
        self.install_btn = flat_button(foot, "Install Now", lambda: self.on_answer(True), primary=True)
        self.later_btn = flat_button(foot, "Not Now", lambda: self.on_answer(False))
        self.open_btn = flat_button(foot, "Open CaseVault", self.on_open, primary=True)
        self.close_btn = flat_button(foot, "Close", self.on_close)
        self.report_btn = flat_button(foot, "Save Problem Report", self.on_report, small=True)  # 1.3.2: shown after an error
        self.close_btn.pack(side="right")
        self.check_btn.pack(side="right", padx=(0, 8))
        self._undo_state(self.ctl.can_undo())

        self.footer = tk.Label(outer, text=f"Updater {__version__} · reads github.com/{settings.repo_slug} · CaseVault-Data is never touched",
                               bg=BG, fg=MUTED, font=(FONT, SMALL), anchor="w", justify="left", wraplength=520)
        self.footer.pack(fill="x", pady=(8, 0), side="bottom", before=foot)  # packed first = lowest
        outer.bind("<Configure>", lambda e: self.footer.configure(wraplength=max(200, e.width - 40)))  # wraps, never cut off

        root.protocol("WM_DELETE_WINDOW", self.on_close)
        root.bind("<Return>", lambda e: self._default())
        root.after(60, self._pump)

    # ---------------------------------------------------------------- look
    def _style(self) -> None:
        s = ttk.Style(self.root)
        if "clam" in s.theme_names():
            s.theme_use("clam")  # the theme that takes our colours on every system
        s.configure("CV.Horizontal.TProgressbar", troughcolor=SOFT, background=NAVY, bordercolor=SOFT,
                    lightcolor=NAVY, darkcolor=NAVY, thickness=6, borderwidth=0)

    def _versions(self, have: str, new: Optional[str], up_to_date: bool = False) -> None:
        """Installed X, then → Available Y when there is an update, or "· Up To Date"."""
        self.v_have.configure(text=f"Installed {short(have) or '?'}" + (" · Up To Date" if up_to_date else ""),
                              fg=GREEN if up_to_date else MUTED)
        if new:
            self.v_new.configure(text=f"Available {short(new)}")
            self.v_arrow.pack(side="left")
            self.v_new.pack(side="left")
        else:
            self.v_arrow.pack_forget()
            self.v_new.pack_forget()

    def _undo_state(self, on: bool) -> None:
        """Undo Last Update shows only when there is an earlier version to go back to."""
        if on:
            self.undo_btn.configure(state="normal")
            if not self.undo_btn.winfo_ismapped():
                self.undo_btn.pack(side="left")
        else:
            self.undo_btn.pack_forget()

    def _say(self, text: str, color: str = TEXT) -> None:
        self.status.configure(text=text, fg=color)

    def _buttons(self, mode: str) -> None:
        """idle: Check for Updates · confirm: Not Now + Install Now · done: Open CaseVault · busy: nothing to press"""
        for b in (self.check_btn, self.install_btn, self.later_btn, self.open_btn):
            b.pack_forget()
        busy = mode == "busy"
        self.finished = mode == "done"
        self.local.spin(busy)
        self.close_btn.configure(state="disabled" if busy else "normal")
        if busy:
            self.undo_btn.configure(state="disabled")
        if mode == "confirm":
            self.install_btn.pack(side="right", padx=(0, 8))
            self.later_btn.pack(side="right", padx=(0, 8))
            return
        if mode == "done":
            self.open_btn.pack(side="right", padx=(0, 8))
            return
        self.check_btn.pack(side="right", padx=(0, 8))
        self.check_btn.configure(state="disabled" if busy else "normal")

    # ---------------------------------------------------------------- the What's New / files panel
    def _fill(self) -> None:
        t = self.files
        t.configure(state="normal")
        t.delete("1.0", "end")
        if self.showing_files:
            self.panel_title.configure(text=f"Files ({len(self.file_lines)})")
            self.files_btn.configure(text="Show What's New")
            t.insert("end", "\n".join(self.file_lines), "mono")
        else:
            self.panel_title.configure(text="What's New")
            self.files_btn.configure(text="Show Files")
            for i, (ver, points) in enumerate(self.news):
                t.insert("end", ("\n" if i else "") + f"Version {short(ver)}\n", "ver")
                for p in points:
                    title, sep, rest = p.partition(":")
                    if sep and len(title) <= 60:
                        t.insert("end", "▪ ", "point")
                        t.insert("end", title + ":", ("point", "title"))
                        t.insert("end", rest + "\n", "point")
                    else:
                        t.insert("end", f"▪ {p}\n", "point")
        t.configure(state="disabled")
        t.yview_moveto(0)

    def _show_panel(self, news, lines) -> None:
        """What's New when there are notes (Show Files switches to the file list), else the file list."""
        self.news, self.file_lines = list(news or []), list(lines or [])
        self.showing_files = not self.news
        if self.news and self.file_lines:
            self.files_btn.pack(side="right")
        else:
            self.files_btn.pack_forget()
        if self.news or self.file_lines:
            self._fill()
            self.news_btn.configure(text="Hide What's New" if self.panel_open else ("What's New" if self.news else "Show Files"))
            self.news_btn.pack(side="right")
        else:
            self.news_btn.pack_forget()
            self.panel_open = False
        self._place_panel()

    def _place_panel(self) -> None:
        """1.3.1: the What's New / files box shows only when opened, and the window grows to hold it."""
        if self.panel_open and (self.news or self.file_lines):
            if not self.listbox.winfo_ismapped():
                self.listbox.pack(fill="both", expand=True, pady=(12, 0))
        elif self.listbox.winfo_ismapped():
            self.listbox.pack_forget()

    def toggle_panel(self) -> None:
        self.panel_open = not self.panel_open
        self.news_btn.configure(text="Hide What's New" if self.panel_open else ("What's New" if self.news else "Show Files"))
        self._place_panel()

    def _show_files(self, lines) -> None:
        self._show_panel([], lines)

    def toggle_files(self) -> None:
        self.showing_files = not self.showing_files
        self._fill()

    def _default(self) -> None:
        if self.waiting:
            self.on_answer(True)
        elif not self.ctl.busy:
            self.on_check()

    # ---------------------------------------------------------------- buttons
    def on_check(self) -> None:
        self.report_btn.pack_forget()
        self._show_panel([], [])
        self.bar["value"] = 0
        self.pct.configure(text="")
        self.detail.configure(text="")
        self.steps.set(0, -1)
        self._buttons("busy")
        self.ctl.check()

    def on_answer(self, yes: bool) -> None:
        if not self.waiting:
            return
        self.waiting = False
        self._buttons("busy")
        if yes:
            self._say("Installing…")
            self.steps.set(2, 1)
        self.ctl.answer(yes)

    def on_report(self) -> None:
        """1.3.2: save what happened and the error to a text file for the developer (no case data)."""
        from .report import save_report
        try:
            path = save_report(self.settings, self.log, self.last_error)
        except OSError as e:
            messagebox.showerror("Save Problem Report", f"The report couldn't be saved: {e}", parent=self.root)
            return
        messagebox.showinfo("Save Problem Report", f"Saved:\n{path}\n\nSend this file to the developer. It holds what the updater did and the error; no case data.", parent=self.root)
        if os.name == "nt":
            try:
                os.startfile(os.path.dirname(path))  # noqa: S606 - opens the folder in Explorer
            except OSError:
                pass

    def on_open(self) -> None:
        if not self.ctl.open_app():
            messagebox.showinfo("Open CaseVault", "Open CaseVault the way you usually do (Start-CaseVault.bat on the CV-AI drive, "
                                "or CaseVault in Edge), then press Ctrl+F5.", parent=self.root)

    def on_undo(self) -> None:
        if self.ctl.busy:
            return
        if not messagebox.askyesno("Undo Last Update", "Put back the version of CaseVault from before the last update?\n\n"
                                   "Close CaseVault in the browser first. Your cases are not affected.", parent=self.root):
            return
        self._show_panel([], [])
        self.steps.set(2, 1)
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
        text = data.get("text") if isinstance(data, dict) else ""
        if text:
            self.log.append((kind, str(text)[:300]))
        if kind == "busy":
            self._say(data["text"])
        elif kind == "progress":
            self._say(data["text"])
            step = STAGE_STEP.get(data.get("stage"), max(self.steps.active, 0))
            self.steps.set(step, step - 1)
            self.bar["value"] = int(1000 * data["fraction"])
            self.pct.configure(text=f"{int(100 * data['fraction'])}%")
            self.detail.configure(text=data.get("detail", "")[:80])
        elif kind == "confirm":
            self.waiting = True
            how = ("The CaseVault helper window will be closed and started again."
                   if data["helper"] else "Close CaseVault in the browser (Edge or Firefox) first, and reload it afterwards.")
            self._say(f"Ready to install: {data['summary']}\nDownloaded and checked; nothing has been changed yet. {how}", TEXT)
            self.detail.configure(text="")
            self.steps.set(2, 1)
            self._versions(data.get("installed", ""), data.get("available") or "?")
            self._show_panel(data.get("news"), data["files"])
            self._buttons("confirm")
            self.install_btn.focus_set()
        elif kind == "done":
            installed = bool(data.get("installed"))
            if installed:
                self.bar["value"] = 1000
                self.pct.configure(text="100%")
            self.detail.configure(text="")
            notes = "\n".join(f"• {n}" for n in data.get("notes", []))
            self._say(data["text"] + (f"\n{notes}" if notes else ""), GREEN if data.get("ok") else TEXT)
            have = data.get("version") or read_app_version(self.settings.app_dir)
            if installed or data.get("ok"):
                # Installed (or Undo put the previous version back): the Done screen.
                self.steps.set(-1, 3)
                self._versions(have, None, up_to_date=installed)
                self._show_panel(self.news if installed else [], [])
                self._buttons("done")
                self.open_btn.focus_set()
            elif "up to date" in data["text"]:
                self.steps.set(-1, 3)
                self._versions(have, None, up_to_date=True)
                self._show_panel([], [])
                self._buttons("idle")
            else:
                self.steps.set(-1, -1)
                self._versions(have, None)
                self._show_panel([], [])
                self._buttons("idle")
        elif kind == "error":
            self.last_error = data["text"]
            self.report_btn.pack(side="left", padx=(8, 0))
            self.detail.configure(text="")
            self._say(data["text"], RED)
            self.steps.set(max(self.steps.active, 0), self.steps.done, failed=True)
            self._show_panel([], [])
            self._buttons("idle")
        elif kind == "local":
            self.local.configure(text=data["text"])
            if not self.ctl.busy and not self.waiting:
                self._buttons("done" if self.finished else "idle")
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
