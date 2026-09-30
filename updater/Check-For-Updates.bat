@echo off
rem ==========================================================================
rem  Check-For-Updates.bat
rem  CaseVault Updater. Lives in CaseVault-App\updater on the SSD; runs only
rem  when you start it. For now (step 1) it checks GitHub for a newer CaseVault
rem  and changes nothing. No installation and no admin rights needed.
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
%PY% -m casevault_updater check %*
set "RC=%errorlevel%"
popd
echo.
pause
exit /b %RC%
