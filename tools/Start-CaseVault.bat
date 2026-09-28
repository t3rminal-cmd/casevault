@echo off
rem ==========================================================================
rem  Start-CaseVault.bat
rem  Starts the CaseVault helper (needed for Firefox) and the portable Ollama
rem  AI engine, then opens CaseVault at http://127.0.0.1:8517/.
rem
rem  Put this file in the ROOT of the CV-AI partition (for example W:\), next to
rem  the casevault-helper, ollama and models folders. It only uses paths
rem  relative to its own location, so drive letter changes do not matter.
rem  No installation and no admin rights needed.
rem ==========================================================================
setlocal
set "HERE=%~dp0"
set "HELPER=%HERE%casevault-helper\casevault-helper.ps1"

if not exist "%HELPER%" (
  echo.
  echo  Could not find "%HELPER%".
  echo  Copy the casevault-helper folder next to this file. See docs\AI-SETUP.md.
  echo.
  pause
  exit /b 1
)

rem -ExecutionPolicy Bypass applies to this one run only; nothing on the PC is changed.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%HELPER%" %*
if errorlevel 1 pause
