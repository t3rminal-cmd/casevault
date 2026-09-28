<#
  Get-WebLLM-Model.ps1
  --------------------
  Downloads a model for CaseVault's in-browser AI (WebLLM) onto the CV-AI drive, ONE TIME, on a PC
  with internet. After that, CaseVault loads it from the SSD with no internet at all.

  Usage (from a Command Prompt; W: is the CV-AI drive):
    powershell -NoProfile -ExecutionPolicy Bypass -File W:\casevault-helper\Get-WebLLM-Model.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File W:\casevault-helper\Get-WebLLM-Model.ps1 -Model Qwen2.5-0.5B-Instruct-q4f16_1-MLC

  The files go to <CV-AI drive>\webllm\<model>\ (next to the casevault-helper folder). A download
  that stops halfway can be resumed by running the script again; finished files are skipped.
  Needs no installation and no admin rights.
#>
[CmdletBinding()]
param(
  [string]$Model = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  [string]$Dest = '',
  [string]$HubUrl = 'https://huggingface.co',
  [string]$LibBase = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/',
  [string]$Lib = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# Compiled model libraries matching the bundled WebLLM version (0.2.x, libraries v0_2_84).
$KnownLibs = @{
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' = 'Qwen2-0.5B-Instruct-q4f16_1_cs1k-webgpu.wasm'
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' = 'Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm'
  'Qwen2.5-3B-Instruct-q4f16_1-MLC'   = 'Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm'
  'Llama-3.2-1B-Instruct-q4f16_1-MLC' = 'Llama-3.2-1B-Instruct-q4f16_1_cs1k-webgpu.wasm'
  'Llama-3.2-3B-Instruct-q4f16_1-MLC' = 'Llama-3.2-3B-Instruct-q4f16_1_cs1k-webgpu.wasm'
}

if (-not $Lib) {
  if (-not $KnownLibs.ContainsKey($Model)) {
    Write-Host "  Unknown model '$Model'. Known models:" -ForegroundColor Yellow
    $KnownLibs.Keys | Sort-Object | ForEach-Object { Write-Host "    $_" }
    Write-Host '  Or pass -Lib <file name of its compiled .wasm library>.'
    exit 1
  }
  $Lib = $KnownLibs[$Model]
}
if ($Model -notmatch '^[A-Za-z0-9._-]+$') { throw "Invalid model name: $Model" }

if (-not $Dest) { $Dest = Join-Path (Split-Path -Parent $PSScriptRoot) 'webllm' }
$ModelDir = Join-Path $Dest $Model
New-Item -ItemType Directory -Path $ModelDir -Force | Out-Null

try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
$ProgressPreference = 'SilentlyContinue'   # much faster downloads in Windows PowerShell

function Save-Url([string]$url, [string]$file, [long]$expected) {
  $have = if (Test-Path -LiteralPath $file) { (Get-Item -LiteralPath $file).Length } else { -1 }
  if (($expected -gt 0 -and $have -eq $expected) -or ($expected -le 0 -and $have -gt 0)) {
    Write-Host "  = $(Split-Path -Leaf $file) (already here)"
    return
  }
  $tmp = "$file.part"
  $dir = Split-Path -Parent $file
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Write-Host "  + $(Split-Path -Leaf $file)"
  Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
  if ($expected -gt 0 -and (Get-Item -LiteralPath $tmp).Length -ne $expected) { throw "Download of $url was incomplete. Run the script again to resume." }
  Move-Item -LiteralPath $tmp -Destination $file -Force
}

Write-Host ''
Write-Host "  Downloading $Model for CaseVault's in-browser AI" -ForegroundColor Cyan
Write-Host "  to $ModelDir"
Write-Host ''

$info = Invoke-RestMethod -Uri "$HubUrl/api/models/mlc-ai/$Model`?blobs=true" -UseBasicParsing
$total = [long]0
foreach ($f in $info.siblings) {
  $name = [string]$f.rfilename
  if ($name -in @('.gitattributes', 'README.md') -or $name.StartsWith('.')) { continue }
  if ($name -match '(^|/)\.\.(/|$)' -or $name -match '^[/\\]' -or $name -match ':') { throw "Unexpected file name from the hub: $name" }
  $size = if ($f.PSObject.Properties.Name -contains 'size' -and $f.size) { [long]$f.size } else { [long]0 }
  $total += $size
  Save-Url "$HubUrl/mlc-ai/$Model/resolve/main/$name" (Join-Path $ModelDir ($name -replace '/', '\')) $size
}
Save-Url ($LibBase + $Lib) (Join-Path $ModelDir $Lib) 0

Write-Host ''
Write-Host ("  Done: {0:N1} GB in {1}" -f (($total) / 1GB), $ModelDir) -ForegroundColor Green
Write-Host '  Start CaseVault with Start-CaseVault.bat; when Ollama is not running it will use this model.'
Write-Host ''
