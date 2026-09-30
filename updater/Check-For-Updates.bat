@echo off
rem ==========================================================================
rem  Check-For-Updates.bat
rem  CaseVault Updater. Lives in CaseVault-App\updater on the SSD; runs only
rem  when you start it. Opens the CaseVault Updater window: Check for Updates,
rem  a progress bar, then Install Now / Not Now. Nothing changes until you
rem  press Install Now. No installation and no admin rights needed.
rem
rem  Python: uses the portable Python in updater\python if it's there,
rem  otherwise a Python already on the PC ("py" or "python"). See README.md.
rem ==========================================================================
setlocal
set "HERE=%~dp0"
set "PY="
rem pythonw.exe runs the window without a black console window behind it.
if exist "%HERE%python\pythonw.exe" set "PY=%HERE%python\pythonw.exe"
if not defined PY if exist "%HERE%python\python.exe" set "PY=%HERE%python\python.exe"
if not defined PY where pyw >nul 2>nul && set "PY=pyw -3"
if not defined PY where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo.
  echo  Python was not found. Put a portable Python in "%HERE%python".
  echo  See "%HERE%README.md".
  echo.
  pause
  exit /b 1
)
pushd "%HERE%"
rem "start" lets this window close at once while the updater window stays open.
start "" %PY% -m casevault_updater window %*
popd
exit /b 0
