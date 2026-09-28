# CaseVault

An offline, browser-based case file manager that stores everything on your own external drive. No cloud, no servers, no tracking.

- **Your data stays on your SSD.** CaseVault reads and writes the vault folder directly through the browser's File System Access API. The browser remembers only *which folder* to reconnect to, never its contents.
- **Works offline.** Install it as an app from GitHub Pages, or run the copy on the SSD by opening `index.html`. There's no build step and nothing to download at runtime.
- **Private by design.** No CDNs, web fonts, analytics, or network calls. A Content-Security-Policy restricts the page to its own files and to `localhost` (reserved for the local AI engine in v1.5).

**Open it:** https://t3rminal-cmd.github.io/casevault/ (Chrome or Edge on desktop)

## Features (v1)

- Cases with number, client, status, tags, and opened/closed dates; search and filter
- Free-form notes (Markdown, with preview)
- Timeline of dated events and deadlines, with overdue/upcoming highlighting across all cases
- File attachments copied onto the SSD, with in-app preview for PDFs, images, text, and media
- Autosave on every change with a **Saved to SSD** indicator; survives unplugging (changes wait and are written on reconnect)
- Daily backups of the vault index, and a self-healing case index

**Coming in v1.5:** Offline Consistency Checker, which compares affidavits against case reports, using rules plus a local AI (Ollama).

## Guides

- [docs/SSD-SETUP.md](docs/SSD-SETUP.md): partitioning the SanDisk Extreme, drive letters, BitLocker To Go
- [docs/USING-CASEVAULT.md](docs/USING-CASEVAULT.md): everyday use
- [docs/AI-SETUP.md](docs/AI-SETUP.md): portable Ollama and models on the CV-AI partition (for v1.5)

## Data layout on the SSD

```
CaseVault-Data/
  vault.json                 app version, settings, case index
  cases/<case-id>/
    case.json                title, number, client, status, tags, dates
    notes.md                 free-form notes
    timeline.json            dated events and deadlines
    files/                   attached documents, copied in
  backups/                   dated snapshots of vault.json
```

## Code layout

| Path | What |
|---|---|
| `index.html` | App shell and Content-Security-Policy |
| `css/app.css` | Styles (system fonts, light/dark) |
| `js/fs.js` | Folder-handle storage (IndexedDB, handle only) and SSD file helpers |
| `js/vault.js` | Vault data model: cases, notes, timeline, files, index, backups |
| `js/markdown.js` | Minimal, escaping Markdown previewer for notes |
| `js/app.js` | User interface, autosave, connect/reconnect |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable offline PWA |
| `tools/Start-CaseVault-AI.bat` | Portable Ollama launcher for the CV-AI partition |
| `scripts/check-no-case-data.sh` | CI guard: fails if anything resembling case data is committed |

Plain HTML, CSS, and JavaScript with classic `<script>` tags, so it also runs from `file://`. To work on it locally, serve the folder (for example `python -m http.server`) and open it in Chrome or Edge.

**Never commit case data.** `.gitignore` blocks it, and CI refuses to deploy if any slips through.

## Deployment

`.github/workflows/pages.yml` publishes the app to GitHub Pages on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
