@echo off
rem ==========================================================================
rem  Start-CaseVault-AI.bat
rem  Starts the portable Ollama engine from the CV-AI partition for CaseVault.
rem  Copy this file to the ROOT of the CV-AI partition (for example W:\).
rem  It uses its own location, so it keeps working if the drive letter changes.
rem ==========================================================================
setlocal

rem Folder this script lives in, without the trailing backslash (e.g. "W:")
set "AI=%~dp0"
if "%AI:~-1%"=="\" set "AI=%AI:~0,-1%"

rem Models are stored on the SSD, never on the PC.
set "OLLAMA_MODELS=%AI%\models"

rem Listen on this computer only. Nothing on the network can reach it.
set "OLLAMA_HOST=127.0.0.1:11434"

rem Allow the hosted CaseVault page (GitHub Pages) to talk to the engine.
set "OLLAMA_ORIGINS=https://t3rminal-cmd.github.io"

rem Unload the model after 10 idle minutes to free GPU/RAM.
set "OLLAMA_KEEP_ALIVE=10m"

if not exist "%AI%\ollama\ollama.exe" (
  echo.
  echo  Could not find "%AI%\ollama\ollama.exe".
  echo  Extract the portable Ollama for Windows into "%AI%\ollama\" first.
  echo  See docs\AI-SETUP.md.
  echo.
  pause
  exit /b 1
)
if not exist "%OLLAMA_MODELS%" mkdir "%OLLAMA_MODELS%"

tasklist /fi "imagename eq ollama.exe" 2>nul | find /i "ollama.exe" >nul
if not errorlevel 1 (
  echo.
  echo  Ollama is already running on this PC, possibly the installed version
  echo  using models on the internal drive. Quit it first: right-click the
  echo  llama icon in the system tray and choose Quit, then run this again.
  echo.
  pause
  exit /b 1
)

title CaseVault AI engine - close this window to stop
echo.
echo  CaseVault AI engine
echo  -------------------
echo  Engine : %AI%\ollama\ollama.exe
echo  Models : %OLLAMA_MODELS%
echo  Address: http://%OLLAMA_HOST%  (this computer only)
echo.
echo  Leave this window open while you use CaseVault. Close it to stop the engine.
echo.

"%AI%\ollama\ollama.exe" serve
