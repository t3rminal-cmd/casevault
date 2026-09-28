@echo off
rem ==========================================================================
rem  Get-WebLLM-Model.bat
rem  One-time download (needs internet) of a model for CaseVault's in-browser
rem  AI, into the webllm folder next to this file. Put this file in the ROOT
rem  of the CV-AI partition, next to casevault-helper. No admin rights needed.
rem  Optional: pass a model name, e.g.  Get-WebLLM-Model.bat -Model Qwen2.5-0.5B-Instruct-q4f16_1-MLC
rem ==========================================================================
setlocal
set "HERE=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%HERE%casevault-helper\Get-WebLLM-Model.ps1" %*
pause
