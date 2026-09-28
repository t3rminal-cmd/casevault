<#
  CaseVault helper
  ----------------
  A tiny local web server that lets CaseVault run in browsers without the File System
  Access API (Firefox). It serves the CaseVault app and reads/writes the CaseVault-Data
  folder on the SSD for it. It also starts the portable Ollama AI engine if present.

  Safety:
    * Listens on 127.0.0.1 only. Nothing on the network can connect.
    * Needs no installation and no admin rights (plain Windows PowerShell 5.1).
    * Uses only paths relative to its own location, and finds the CASEVAULT partition
      by its label, so drive letter changes do not matter.
    * Only same-origin requests from the CaseVault page are accepted. Other websites
      open in the browser cannot read or write anything through it.

  Usage: started by Start-CaseVault.bat. Advanced options:
    -Port 8517           port to listen on
    -DataPath <folder>   use this CaseVault-Data folder instead of searching the drives
    -AppPath <folder>    serve the app from this folder
    -NoBrowser           do not open the browser
    -NoAI                do not start Ollama
#>
[CmdletBinding()]
param(
  [int]$Port = 8517,
  [string]$DataPath = '',
  [string]$AppPath = '',
  [switch]$NoBrowser,
  [switch]$NoAI
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$HelperVersion = '1.5.0'
$VolumeLabel   = 'CASEVAULT'
$DataDirName   = 'CaseVault-Data'
$AppDirName    = 'CaseVault-App'
$PagesOrigin   = 'https://t3rminal-cmd.github.io'
$MaxHeaderBytes = 65536

$Sep      = [System.IO.Path]::DirectorySeparatorChar
$AIRoot   = Split-Path -Parent $PSScriptRoot      # e.g. W:\  (the folder holding Start-CaseVault.bat)
$Origins  = @("http://127.0.0.1:$Port", "http://localhost:$Port")
$Hosts    = @("127.0.0.1:$Port", "localhost:$Port")
$Utf8     = New-Object System.Text.UTF8Encoding($false)

function Write-Info([string]$msg)  { Write-Host "  $msg" }
function Write-Warn([string]$msg)  { Write-Host "  ! $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
# Locating the vault and the app
# ---------------------------------------------------------------------------

$script:DataRoot = $null

function Find-DataRoot {
  if ($DataPath) {
    $p = [System.IO.Path]::GetFullPath($DataPath)
    if ((Split-Path -Leaf $p) -ne $DataDirName -and (Test-Path -LiteralPath (Join-Path $p $DataDirName))) {
      $p = Join-Path $p $DataDirName
    }
    if (Test-Path -LiteralPath $p -PathType Container) { return $p }
    return $null
  }
  $labelled = $null
  foreach ($d in [System.IO.DriveInfo]::GetDrives()) {
    try {
      if (-not $d.IsReady) { continue }   # BitLocker-locked or empty drives are not ready
      $candidate = Join-Path $d.RootDirectory.FullName $DataDirName
      if (Test-Path -LiteralPath (Join-Path $candidate 'vault.json')) { return $candidate }
      if ($d.VolumeLabel -eq $VolumeLabel -and -not $labelled) { $labelled = $candidate }
    } catch { }
  }
  if ($labelled) {
    # A CASEVAULT partition without a vault yet: create the empty folder; the app offers to set it up.
    New-Item -ItemType Directory -Path $labelled -Force | Out-Null
    return $labelled
  }
  return $null
}

# Returns the vault folder, re-scanning the drives if it disappeared (unplugged or letter changed).
function Get-DataRoot {
  if ($script:DataRoot -and (Test-Path -LiteralPath $script:DataRoot -PathType Container)) { return $script:DataRoot }
  $script:DataRoot = Find-DataRoot
  return $script:DataRoot
}

function Find-AppRoot {
  $candidates = @()
  if ($AppPath) { $candidates += $AppPath }
  $root = Get-DataRoot
  if ($root) { $candidates += (Join-Path (Split-Path -Parent $root) $AppDirName) }
  $candidates += (Join-Path $PSScriptRoot 'app')
  $candidates += (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))   # running from a repo checkout: tools\casevault-helper\..\..
  foreach ($c in $candidates) {
    if ($c -and (Test-Path -LiteralPath (Join-Path $c 'index.html')) -and (Test-Path -LiteralPath (Join-Path $c 'js'))) {
      return [System.IO.Path]::GetFullPath($c)
    }
  }
  return $null
}

# ---------------------------------------------------------------------------
# Safe path handling: every request path must stay inside its root folder
# ---------------------------------------------------------------------------

function Resolve-SafePath([string]$root, [string]$rel) {
  $full = $root
  if ($rel) {
    foreach ($seg in $rel.Split('/')) {
      if ($seg -eq '' -or $seg -eq '.' -or $seg -eq '..') { return $null }
      if ($seg -match '[\\:*?"<>|\x00-\x1f]') { return $null }
      if ($seg -match '[. ]$') { return $null }
      $full = Join-Path $full $seg
    }
  }
  $full = [System.IO.Path]::GetFullPath($full)
  $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd($Sep)
  if ($full -ne $rootFull -and -not $full.StartsWith($rootFull + $Sep, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $full
}

# ---------------------------------------------------------------------------
# JSON (hand-written so it behaves the same on every PowerShell version)
# ---------------------------------------------------------------------------

function ConvertTo-JsonString([string]$s) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('"')
  foreach ($ch in $s.ToCharArray()) {
    $c = [int]$ch
    if ($ch -eq '"') { [void]$sb.Append('\"') }
    elseif ($ch -eq '\') { [void]$sb.Append('\\') }
    elseif ($c -lt 32) { [void]$sb.Append(('\u{0:x4}' -f $c)) }
    else { [void]$sb.Append($ch) }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

function Get-UnixMs([datetime]$utc) {
  return [long]([DateTimeOffset]::new($utc.ToUniversalTime())).ToUnixTimeMilliseconds()
}

function Get-EntryJson([System.IO.FileSystemInfo]$fi) {
  $isDir = ($fi.Attributes -band [System.IO.FileAttributes]::Directory) -ne 0
  $kind = if ($isDir) { 'directory' } else { 'file' }
  $size = if ($isDir) { 0 } else { $fi.Length }
  return '{"name":' + (ConvertTo-JsonString $fi.Name) + ',"kind":"' + $kind + '","size":' + $size + ',"mtime":' + (Get-UnixMs $fi.LastWriteTimeUtc) + '}'
}

# ---------------------------------------------------------------------------
# HTTP plumbing
# ---------------------------------------------------------------------------

$StatusText = @{ 200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 405 = 'Method Not Allowed'; 409 = 'Conflict'; 411 = 'Length Required'; 413 = 'Payload Too Large'; 421 = 'Misdirected Request'; 500 = 'Internal Server Error'; 503 = 'Service Unavailable' }

$ContentTypes = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.wasm' = 'application/wasm'
  '.md' = 'text/markdown; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'; '.gz' = 'application/gzip'
  '.traineddata' = 'application/octet-stream'; '.bcmap' = 'application/octet-stream'; '.pfb' = 'application/octet-stream'; '.ttf' = 'font/ttf'
}

function Send-Head($stream, [int]$status, [string]$contentType, [long]$length, [hashtable]$extra, [bool]$isApi) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("HTTP/1.1 $status $($StatusText[$status])")
  if ($contentType) { $lines.Add("Content-Type: $contentType") }
  $lines.Add("Content-Length: $length")
  $lines.Add('Connection: close')
  $lines.Add('X-Content-Type-Options: nosniff')
  $lines.Add('Cross-Origin-Resource-Policy: same-origin')
  $lines.Add('Referrer-Policy: no-referrer')
  $lines.Add('X-Frame-Options: SAMEORIGIN')
  if ($isApi) { $lines.Add('Cache-Control: no-store') } else { $lines.Add('Cache-Control: no-cache') }
  if ($extra) { foreach ($k in $extra.Keys) { $lines.Add("${k}: $($extra[$k])") } }
  $bytes = [System.Text.Encoding]::ASCII.GetBytes(($lines -join "`r`n") + "`r`n`r`n")
  $stream.Write($bytes, 0, $bytes.Length)
}

function Send-Bytes($stream, [int]$status, [string]$contentType, [byte[]]$body, [bool]$isApi, [bool]$headOnly = $false) {
  if ($null -eq $body) { $body = [byte[]]@() }
  Send-Head $stream $status $contentType $body.Length $null $isApi
  if (-not $headOnly -and $body.Length) { $stream.Write($body, 0, $body.Length) }
}

function Send-Json($stream, [int]$status, [string]$json) {
  Send-Bytes $stream $status 'application/json; charset=utf-8' $Utf8.GetBytes($json) $true
}

function Send-Error($stream, [int]$status, [string]$name, [string]$message) {
  Send-Json $stream $status ('{"error":' + (ConvertTo-JsonString $name) + ',"message":' + (ConvertTo-JsonString $message) + '}')
}

function Send-FileBody($stream, [string]$path, [string]$contentType, [bool]$isApi, [bool]$headOnly) {
  $fi = New-Object System.IO.FileInfo($path)
  $extra = @{ 'X-Mtime' = (Get-UnixMs $fi.LastWriteTimeUtc) }
  $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    Send-Head $stream 200 $contentType $fs.Length $extra $isApi
    if (-not $headOnly) { $fs.CopyTo($stream, 81920) }
  } finally { $fs.Dispose() }
}

function Read-Request($stream) {
  $buf = New-Object System.IO.MemoryStream
  $last4 = 0
  while ($true) {
    $b = $stream.ReadByte()
    if ($b -lt 0) { return $null }
    $buf.WriteByte([byte]$b)
    $last4 = (($last4 -shl 8) -bor $b) -band 0xFFFFFFFF
    if ($last4 -eq 0x0D0A0D0A) { break }
    if ($buf.Length -gt $MaxHeaderBytes) { return $null }
  }
  $text = [System.Text.Encoding]::ASCII.GetString($buf.ToArray())
  $lines = $text -split "`r`n"
  $parts = $lines[0].Split(' ')
  if ($parts.Length -lt 3) { return $null }
  $headers = @{}
  for ($i = 1; $i -lt $lines.Length; $i++) {
    $idx = $lines[$i].IndexOf(':')
    if ($idx -gt 0) { $headers[$lines[$i].Substring(0, $idx).Trim().ToLowerInvariant()] = $lines[$i].Substring($idx + 1).Trim() }
  }
  $target = $parts[1]
  $q = @{}
  $path = $target
  $qi = $target.IndexOf('?')
  if ($qi -ge 0) {
    $path = $target.Substring(0, $qi)
    foreach ($pair in $target.Substring($qi + 1).Split('&')) {
      if (-not $pair) { continue }
      $eq = $pair.IndexOf('=')
      if ($eq -lt 0) { $q[[Uri]::UnescapeDataString($pair)] = '' }
      else { $q[[Uri]::UnescapeDataString($pair.Substring(0, $eq))] = [Uri]::UnescapeDataString($pair.Substring($eq + 1)) }
    }
  }
  return @{ Method = $parts[0].ToUpperInvariant(); Path = [Uri]::UnescapeDataString($path); Query = $q; Headers = $headers }
}

# Copy exactly $length bytes of request body into a new file.
function Receive-BodyToFile($stream, [long]$length, [string]$dest) {
  $fs = [System.IO.File]::Open($dest, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    $buffer = New-Object byte[] 81920
    $remaining = $length
    while ($remaining -gt 0) {
      $want = [int][Math]::Min($buffer.Length, $remaining)
      $n = $stream.Read($buffer, 0, $want)
      if ($n -le 0) { throw 'Connection closed before the whole file arrived.' }
      $fs.Write($buffer, 0, $n)
      $remaining -= $n
    }
    $fs.Flush($true)
  } finally { $fs.Dispose() }
}

# ---------------------------------------------------------------------------
# Request handling
# ---------------------------------------------------------------------------

function Test-SameOrigin($req) {
  $h = $req.Headers
  if (-not $h.ContainsKey('x-casevault') -or $h['x-casevault'] -ne '1') { return $false }        # forces a CORS preflight for other sites
  if ($h.ContainsKey('origin') -and ($Origins -notcontains $h['origin'])) { return $false }
  if ($h.ContainsKey('sec-fetch-site') -and $h['sec-fetch-site'] -ne 'same-origin') { return $false }
  return $true
}

function Invoke-Api($stream, $req) {
  $op = $req.Path.Substring(5)   # after "/api/"
  $m = $req.Method

  if ($op -eq 'info' -and $m -eq 'GET') {
    $root = Get-DataRoot
    $ready = if ($root) { 'true' } else { 'false' }
    $rootName = if ($root) { Split-Path -Leaf $root } else { '' }
    $drive = if ($root) { [System.IO.Path]::GetPathRoot($root) } else { '' }
    Send-Json $stream 200 ('{"app":"CaseVault helper","version":' + (ConvertTo-JsonString $HelperVersion) + ',"ready":' + $ready + ',"root":' + (ConvertTo-JsonString $rootName) + ',"drive":' + (ConvertTo-JsonString $drive) + '}')
    return
  }

  $root = Get-DataRoot
  if (-not $root) { Send-Error $stream 503 'NotReadableError' 'The CASEVAULT drive is not connected or is still locked.'; return }
  $rel = if ($req.Query.ContainsKey('p')) { $req.Query['p'] } else { '' }
  $full = Resolve-SafePath $root $rel
  if (-not $full) { Send-Error $stream 400 'SecurityError' 'Invalid path.'; return }
  $isDir = Test-Path -LiteralPath $full -PathType Container
  $isFile = (-not $isDir) -and (Test-Path -LiteralPath $full -PathType Leaf)

  switch ($op) {
    'stat' {
      if (-not ($isDir -or $isFile)) { Send-Json $stream 200 'null'; return }   # "does it exist?" is a normal question, not an error
      $fi = if ($isDir) { New-Object System.IO.DirectoryInfo($full) } else { New-Object System.IO.FileInfo($full) }
      Send-Json $stream 200 (Get-EntryJson $fi)
    }
    'list' {
      if ($isFile) { Send-Error $stream 409 'TypeMismatchError' 'That is a file, not a folder.'; return }
      if (-not $isDir) { Send-Error $stream 404 'NotFoundError' 'Folder not found.'; return }
      $items = @()
      foreach ($fi in (New-Object System.IO.DirectoryInfo($full)).EnumerateFileSystemInfos()) {
        if ($fi.Name -like '*.cvtmp-*') { continue }   # half-written temp files
        $items += (Get-EntryJson $fi)
      }
      Send-Json $stream 200 ('[' + ($items -join ',') + ']')
    }
    'read' {
      if ($isDir) { Send-Error $stream 409 'TypeMismatchError' 'That is a folder, not a file.'; return }
      if (-not $isFile) { Send-Error $stream 404 'NotFoundError' 'File not found.'; return }
      Send-FileBody $stream $full 'application/octet-stream' $true ($m -eq 'HEAD')
    }
    'write' {
      if ($m -ne 'PUT') { Send-Error $stream 405 'NotAllowedError' 'Use PUT.'; return }
      if ($isDir) { Send-Error $stream 409 'TypeMismatchError' 'That is a folder, not a file.'; return }
      $parent = Split-Path -Parent $full
      if (-not (Test-Path -LiteralPath $parent -PathType Container)) { Send-Error $stream 404 'NotFoundError' 'Folder not found.'; return }
      if (-not $req.Headers.ContainsKey('content-length')) { Send-Error $stream 411 'NotAllowedError' 'Content-Length required.'; return }
      $len = [long]$req.Headers['content-length']
      # Write to a temp file next to the target, then swap it in, so a pulled cable never leaves half a file.
      $tmp = $full + '.cvtmp-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
      try {
        Receive-BodyToFile $stream $len $tmp
        if (Test-Path -LiteralPath $full) {
          try { [System.IO.File]::Replace($tmp, $full, $null) }
          catch { [System.IO.File]::Delete($full); [System.IO.File]::Move($tmp, $full) }
        } else {
          [System.IO.File]::Move($tmp, $full)
        }
      } catch {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        throw
      }
      Send-Json $stream 200 (Get-EntryJson (New-Object System.IO.FileInfo($full)))
    }
    'mkdir' {
      if ($m -ne 'POST') { Send-Error $stream 405 'NotAllowedError' 'Use POST.'; return }
      if ($isFile) { Send-Error $stream 409 'TypeMismatchError' 'A file with that name exists.'; return }
      $parent = Split-Path -Parent $full
      if (-not $isDir -and -not (Test-Path -LiteralPath $parent -PathType Container)) { Send-Error $stream 404 'NotFoundError' 'Folder not found.'; return }
      if (-not $isDir) { [void][System.IO.Directory]::CreateDirectory($full) }
      Send-Json $stream 200 (Get-EntryJson (New-Object System.IO.DirectoryInfo($full)))
    }
    'remove' {
      if ($m -ne 'DELETE') { Send-Error $stream 405 'NotAllowedError' 'Use DELETE.'; return }
      if (-not $rel) { Send-Error $stream 400 'SecurityError' 'Refusing to delete the vault folder itself.'; return }
      if ($isFile) { [System.IO.File]::Delete($full) }
      elseif ($isDir) {
        $recursive = $req.Query.ContainsKey('recursive') -and $req.Query['recursive'] -eq '1'
        $hasChildren = [System.IO.Directory]::EnumerateFileSystemEntries($full).GetEnumerator().MoveNext()
        if ($hasChildren -and -not $recursive) { Send-Error $stream 409 'InvalidModificationError' 'Folder is not empty.'; return }
        [System.IO.Directory]::Delete($full, $true)
      } else { Send-Error $stream 404 'NotFoundError' 'Not found.'; return }
      Send-Json $stream 200 '{"ok":true}'
    }
    default { Send-Error $stream 404 'NotFoundError' 'Unknown API call.' }
  }
}

function Invoke-Static($stream, $req) {
  if ($req.Method -ne 'GET' -and $req.Method -ne 'HEAD') { Send-Bytes $stream 405 'text/plain' ([Text.Encoding]::ASCII.GetBytes('Method not allowed')) $false; return }
  $app = Find-AppRoot
  if (-not $app) {
    $msg = "CaseVault app files not found. Copy the app into $AppDirName on the CASEVAULT drive (see docs/USING-CASEVAULT.md)."
    Send-Bytes $stream 404 'text/plain; charset=utf-8' $Utf8.GetBytes($msg) $false; return
  }
  $rel = $req.Path.TrimStart('/')
  if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
  $full = Resolve-SafePath $app $rel
  if (-not $full -or -not (Test-Path -LiteralPath $full -PathType Leaf)) { Send-Bytes $stream 404 'text/plain' ([Text.Encoding]::ASCII.GetBytes('Not found')) $false; return }
  $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
  $type = if ($ContentTypes.ContainsKey($ext)) { $ContentTypes[$ext] } else { 'application/octet-stream' }
  Send-FileBody $stream $full $type $false ($req.Method -eq 'HEAD')
}

function Invoke-Client($client) {
  $client.ReceiveTimeout = 30000
  $client.SendTimeout = 30000
  $stream = $client.GetStream()
  try {
    $req = Read-Request $stream
    if (-not $req) { return }
    # Only answer to our own address: blocks DNS-rebinding tricks from other websites.
    if (-not $req.Headers.ContainsKey('host') -or ($Hosts -notcontains $req.Headers['host'].ToLowerInvariant())) {
      Send-Bytes $stream 421 'text/plain' ([Text.Encoding]::ASCII.GetBytes('Wrong host')) $false; return
    }
    if ($req.Path.StartsWith('/api/')) {
      if ($req.Method -eq 'OPTIONS' -or -not (Test-SameOrigin $req)) { Send-Error $stream 403 'SecurityError' 'Only the CaseVault page may use this.'; return }
      try { Invoke-Api $stream $req }
      catch {
        $name = 'UnknownError'
        if ($_.Exception -is [System.IO.IOException] -or $_.Exception.InnerException -is [System.IO.IOException]) { $name = 'NotReadableError' }
        if ($_.Exception -is [System.UnauthorizedAccessException] -or $_.Exception.InnerException -is [System.UnauthorizedAccessException]) { $name = 'NotAllowedError' }
        try { Send-Error $stream 500 $name $_.Exception.Message } catch { }
      }
    } else {
      Invoke-Static $stream $req
    }
  } catch {
    # Client went away mid-request; nothing to do.
  } finally {
    try { $stream.Dispose() } catch { }
    try { $client.Close() } catch { }
  }
}

# ---------------------------------------------------------------------------
# Ollama (optional)
# ---------------------------------------------------------------------------

function Start-Ollama {
  $exe = Join-Path (Join-Path $AIRoot 'ollama') 'ollama.exe'
  if ($NoAI -or -not (Test-Path -LiteralPath $exe)) { Write-Info 'AI engine : not started (Ollama not found next to this helper)'; return $null }
  if (Get-Process -Name 'ollama' -ErrorAction SilentlyContinue) {
    Write-Warn 'Ollama is already running (maybe the installed app). Quit it from the tray to use the SSD models.'
    return $null
  }
  $models = Join-Path $AIRoot 'models'
  $logs = Join-Path $AIRoot 'logs'
  New-Item -ItemType Directory -Path $models, $logs -Force | Out-Null
  $env:OLLAMA_MODELS = $models
  $env:OLLAMA_HOST = '127.0.0.1:11434'
  $env:OLLAMA_ORIGINS = ($PagesOrigin, "http://127.0.0.1:$Port", "http://localhost:$Port") -join ','
  $env:OLLAMA_KEEP_ALIVE = '10m'
  # Same console window: closing this window stops Ollama too.
  $p = Start-Process -FilePath $exe -ArgumentList 'serve' -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $logs 'ollama-out.log') -RedirectStandardError (Join-Path $logs 'ollama.log')
  Write-Info "AI engine : Ollama started, models in $models"
  return $p
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

$Host.UI.RawUI.WindowTitle = 'CaseVault helper - close this window to stop'
Write-Host ''
Write-Host "  CaseVault helper $HelperVersion" -ForegroundColor Cyan
Write-Host '  --------------------------'

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
try { $listener.Start() }
catch {
  Write-Warn "Port $Port is already in use. Is the CaseVault helper already running in another window?"
  if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port/" }
  exit 1
}

$root = Get-DataRoot
if ($root) { Write-Info "Vault     : $root" } else { Write-Warn 'Vault     : CASEVAULT drive not found yet. Plug in and unlock the SSD; the app will pick it up.' }
$app = Find-AppRoot
if ($app) { Write-Info "App       : $app" } else { Write-Warn "App       : not found. Copy the app into $AppDirName on the CASEVAULT drive." }
$ollama = Start-Ollama
Write-Info "Address   : http://127.0.0.1:$Port/  (this computer only)"
Write-Host ''
Write-Host '  Leave this window open while you use CaseVault. Close it to stop.' -ForegroundColor Green
Write-Host ''

if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port/" }

try {
  while ($true) {
    $task = $listener.AcceptTcpClientAsync()
    while (-not $task.Wait(250)) { }   # short waits keep Ctrl+C responsive
    Invoke-Client $task.Result
  }
} finally {
  $listener.Stop()
  if ($ollama -and -not $ollama.HasExited) { try { $ollama.Kill() } catch { } }
}
