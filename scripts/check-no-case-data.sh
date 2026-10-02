#!/usr/bin/env bash
# Fails if any tracked file looks like CaseVault case data.
# Runs in CI before every deploy. You can also run it locally:  bash scripts/check-no-case-data.sh
set -euo pipefail

pattern='(^|/)(CaseVault-Data|CaseVault-AI|CV-AI|cases|backups|checks|models|ollama)/'
pattern+='|(^|/)(vault|case|timeline)\.json$|(^|/)notes\.md$|-check\.json$'
pattern+='|\.(pdf|docx?|rtf|odt|xlsx?|csv|pptx?|msg|eml|pst|jpe?g|gif|bmp|tiff?|heic|webp|mp3|m4a|wav|mp4|mov|avi|zip|7z|rar|gguf|safetensors|bek)$'

# App icons are the only images the repo is allowed to contain: icons/*.png|svg and, from v1.51,
# the colour icons icons/color/<name>.png (lower-case names only).
hits=$(git ls-files | grep -Ei "$pattern" | grep -Ev '^icons/[^/]+\.(png|svg)$' | grep -Ev '^icons/color/[a-z0-9-]+\.png$' || true)

if [ -n "$hits" ]; then
  echo "::error::Possible case data is committed to the repository. Remove it (and purge it from history):"
  echo "$hits"
  exit 1
fi
echo "OK: no case data found in tracked files."
