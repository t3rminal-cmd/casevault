# CaseVault

An offline, browser-based case file manager that stores everything on your own external drive, with an offline consistency checker for affidavits. No cloud, no servers, no tracking.

- **Your data stays on your SSD.** CaseVault reads and writes the vault folder directly through the browser's File System Access API. The browser remembers only *which folder* to reconnect to, never its contents.
- **Works offline.** Install it as an app from GitHub Pages, or run the copy on the SSD. There's no build step and nothing to download at runtime; every library is bundled in `vendor/`.
- **Private by design.** No CDNs, web fonts, analytics, or network calls. A Content-Security-Policy restricts the page to its own files and to the local AI engine on `127.0.0.1:11434`.

**Open it:** https://t3rminal-cmd.github.io/casevault/ (Chrome or Edge on desktop), or `W:\Start-CaseVault.bat` (Firefox, or any browser).

| Browser | Mode |
|---|---|
| Chrome, Edge | **Direct**: the File System Access API reads and writes the SSD folder. No helper needed. |
| Firefox | **Helper**: `tools/casevault-helper`, a PowerShell script started by `Start-CaseVault.bat`. It needs no install or admin rights, listens on 127.0.0.1 only, serves the app, and reads/writes `CaseVault-Data`. |

The app detects the browser and picks the mode by itself. The data format on the SSD is identical in both.

## Features (v1.7)

- Cases with number, client, status, tags, and opened/closed dates; search and filter
- Free-form notes (Markdown, with preview)
- Timeline of dated events and deadlines, with overdue/upcoming highlighting across all cases
- File attachments copied onto the SSD, with in-app preview for PDFs, images, text, and media
- Autosave on every change with a **Saved to SSD** indicator; survives unplugging (changes wait and are written on reconnect)
- Daily backups of the vault index, and a self-healing case index
- **Offline Consistency Checker**: compares an affidavit against the case's reports, and the reports against each other
  - reads PDF (with OCR for scanned pages), DOCX, TXT, and photos
  - **Rules layer:** dates, times (12h/24h), names (spelling variants), case/report numbers, addresses, plates, phone numbers, amounts, and counts
  - **AI layer:** local Ollama; Supported / Contradicted / Not found, with every quote verified word-for-word against the report (answers that fail are discarded)
  - side-by-side results with click-to-source, High/Medium/Low severity, and Fix / Not an issue / Explained, saved to `checks/<date>-check.json`
  - AI profiles (Quick / Thorough / Light / Rules-only), auto-detected from installed models
- **Excel and CSV**: `.xlsx/.xls/.ods/.csv` open as tables with sheet tabs, and the checker reads them row by row with sheet + row locations (bundled SheetJS, loaded only when needed)
- **Privacy screen**: Ctrl+Shift+H, Esc twice, or **Hide** instantly covers the app (the tab title becomes "New Tab", media pauses, edits are saved). Optional 4–6 digit PIN, stored as a salted SHA-256 hash, and optional auto-hide after inactivity
- **Drafts with a local-AI copilot**: Markdown drafts per case, saved to `drafts/` on the SSD
  - inline grey suggestions (Tab accepts)
  - **Draft with AI** from the case details, timeline, notes and attached documents, never inventing facts and marking gaps as `[CONFIRM: ...]`
  - a checklist of placeholders
  - agency templates with `{{placeholders}}`
  - export to `.docx` (no library) or plain text
  - one-click consistency check of an affidavit draft

- **In-browser AI fallback**: when Ollama isn't running, a small WebLLM model runs on the PC's graphics chip (WebGPU), loaded from `W:\webllm` through the helper. The checker and drafting copilot use it unchanged via an Ollama-compatible shim. The browser's copy of the model is deleted right after loading.

**Not yet built:** the in-browser AI in the hosted/installed app when it's opened *without* the launcher (direct mode). It currently needs the helper to serve the model files.

## Guides

- [docs/SSD-SETUP.md](docs/SSD-SETUP.md): partitioning the SanDisk Extreme, drive letters, BitLocker To Go
- [docs/USING-CASEVAULT.md](docs/USING-CASEVAULT.md): everyday use
- [docs/AI-SETUP.md](docs/AI-SETUP.md): the launcher, the Firefox helper, portable Ollama and models on the CV-AI partition

## Data layout on the SSD

```
CaseVault-Data/
  vault.json                 app version, settings, case index
  cases/<case-id>/
    case.json                title, number, client, status, tags, dates
    notes.md                 free-form notes
    timeline.json            dated events and deadlines
    files/                   attached documents, copied in
    drafts/                  drafts: <slug>.md (Markdown, details in the first line)
    checks/                  consistency checks: <date>-check.json
      text-cache/            text read from documents (so OCR runs once)
  templates/                 your document templates (*.md)
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
| `js/helper-fs.js` | Helper mode: wraps the helper's API in FileSystemHandle-shaped objects |
| `js/checker/nlp.js` | Sentence splitting, similarity, BM25 retrieval, verbatim-quote finder |
| `js/checker/rules.js` | Layer 1: fact extraction and cross-document comparison |
| `js/checker/extract.js` | Text from PDF (pdf.js + OCR), DOCX, TXT, images (Tesseract) |
| `js/checker/ai.js` | Layer 2: Ollama detection, profiles, retrieval, classification, quote verification |
| `js/checker/checks-ui.js` | Checks tab, results, engine status and AI settings |
| `js/checker/sheets.js` | Spreadsheets (.xlsx/.xls/.csv) for the preview and the checker |
| `js/privacy.js` | Privacy screen: shortcut, cover, PIN hashing, idle timer |
| `js/drafts/draft-core.js` | Draft file format, [CONFIRM: ...] placeholders, templates, starter templates |
| `js/drafts/docx.js` | Markdown to .docx, with a tiny built-in zip writer |
| `js/drafts/ghost.js` | Inline suggestion (ghost text) logic |
| `js/drafts/copilot.js` | Local-AI calls for suggestions and Draft with AI |
| `js/drafts/drafts-ui.js` | Drafts tab, editor, export, template settings |
| `js/ai/webllm.js`, `js/ai/webllm-worker.js` | In-browser AI fallback: availability, lazy loading, cache cleanup; the worker that runs WebLLM |
| `js/ai/ollama-shim.js` | Answers Ollama-style API calls from the in-browser engine |
| `vendor/` | Bundled pdf.js, Tesseract.js, SheetJS and WebLLM (see `vendor/README.md` for versions, licenses and provenance) |
| `tools/Start-CaseVault.bat` | Launcher for the CV-AI partition: starts the helper and Ollama |
| `tools/casevault-helper/` | The Firefox helper (Windows PowerShell 5.1, 127.0.0.1 only); also serves in-browser models from `W:\webllm`, and holds `Get-WebLLM-Model.ps1` |
| `tools/Get-WebLLM-Model.bat` | One-time download of an in-browser model onto the CV-AI drive |
| `tests/` | Unit tests (`node --test tests/*.test.js`) and a mock Ollama server |
| `scripts/check-no-case-data.sh` | CI guard: fails if anything resembling case data is committed |

Plain HTML, CSS, and JavaScript with classic `<script>` tags, so it also runs from `file://` (PDF reading and OCR need `http(s)`). To work on it locally, serve the folder (for example `python -m http.server`) and open it in Chrome or Edge. For the AI layer without a real model, run `node tests/mock-ollama.js`.

**Never commit case data.** `.gitignore` blocks it, and CI refuses to deploy if any slips through.

## Deployment

`.github/workflows/pages.yml` publishes the app to GitHub Pages on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
