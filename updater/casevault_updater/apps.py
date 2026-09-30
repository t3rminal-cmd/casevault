"""Stopping CaseVault before an install and starting it again afterwards.

What "CaseVault running" means depends on the browser:

  * Firefox (and Edge through the helper): the CaseVault helper, a PowerShell window started by
    W:\\Start-CaseVault.bat, serves the app at http://127.0.0.1:8517/ and started the portable Ollama
    from the CV-AI drive. The updater stops both (only those: the helper by its script name, Ollama
    only if it runs from the CV-AI drive), installs, and runs Start-CaseVault.bat again, which opens
    CaseVault in the browser.
  * Edge on its own opens the SSD directly; there is no separate program to stop. The updater
    can't close a browser window (it would take your other tabs with it), so the window asks you
    to close CaseVault first and to reload it afterwards.

Everything here is Windows-only; elsewhere (and in the tests) nothing is stopped or started.
"""

import base64
import os
import socket
import subprocess
import time
from typing import Optional

HELPER_PORT = 8517
HELPER_SCRIPT = "casevault-helper.ps1"
START_BAT = "Start-CaseVault.bat"
IS_WINDOWS = os.name == "nt"


def helper_running(port: int = HELPER_PORT, timeout: float = 0.5) -> bool:
    """Is something listening on the helper's port on this PC?"""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def _powershell(script: str, timeout: float = 20) -> subprocess.CompletedProcess:
    # -EncodedCommand (UTF-16LE, base64) so no quoting on the Windows command line can change it.
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    return subprocess.run(["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                          capture_output=True, text=True, timeout=timeout, creationflags=flags)


def stop_helper(tools_dir: Optional[str], port: int = HELPER_PORT, wait: float = 10.0) -> bool:
    """Stop the CaseVault helper (and the Ollama it started from the CV-AI drive). True when the
    port is free afterwards."""
    if not helper_running(port):
        return True
    if not IS_WINDOWS:
        return False
    parts = [f"Get-CimInstance Win32_Process -Filter \"Name='powershell.exe' OR Name='pwsh.exe'\" | "
             f"Where-Object {{ $_.CommandLine -like '*{HELPER_SCRIPT}*' }} | "
             "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"]
    if tools_dir:
        root = os.path.abspath(tools_dir).replace("'", "''")
        parts.append("Get-CimInstance Win32_Process -Filter \"Name='ollama.exe' OR Name='ollama app.exe'\" | "
                     f"Where-Object {{ $_.ExecutablePath -and $_.ExecutablePath.StartsWith('{root}', 'OrdinalIgnoreCase') }} | "
                     "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }")
    try:
        _powershell("; ".join(parts))
    except (OSError, subprocess.SubprocessError):
        return False
    end = time.time() + wait
    while time.time() < end:
        if not helper_running(port):
            return True
        time.sleep(0.3)
    return False


def start_helper(tools_dir: Optional[str]) -> bool:
    """Run Start-CaseVault.bat in its own window (it opens CaseVault in the browser)."""
    if not IS_WINDOWS or not tools_dir:
        return False
    bat = os.path.join(tools_dir, START_BAT)
    if not os.path.isfile(bat):
        return False
    try:
        subprocess.Popen(["cmd.exe", "/c", "start", "CaseVault helper", bat], cwd=tools_dir,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), close_fds=True)
        return True
    except OSError:
        return False
