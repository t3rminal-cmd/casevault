@echo off
rem ==========================================================================
rem  Update-CaseVault.bat
rem  CaseVault Updater. Lives in CaseVault-App\updater on the SSD; runs only
rem  when you start it. Checks GitHub, downloads only the changed files, asks,
rem  then installs them with a backup (put back if anything fails). Closes and
rem  restarts the CaseVault helper if it runs. "Update-CaseVault.bat undo" puts
rem  back the version from before the last update. No admin rights needed.
rem
rem  Python: uses the portable Python in updater\python if it's there,
rem  otherwise a Python already on the PC ("py" or "python"). See README.md.
rem ==========================================================================
setlocal
set "HERE=%~dp0"
set "PY="
if exist "%HERE%python\python.exe" set "PY=%HERE%python\python.exe"
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
if /i "%~1"=="undo" (%PY% -m casevault_updater undo) else (%PY% -m casevault_updater install %*)
set "RC=%errorlevel%"
popd
echo.
pause
exit /b %RC%
