# CaseVault

An offline, browser-based case file manager that stores everything on your own external drive, with an offline consistency checker for affidavits. No cloud, no servers, no tracking.

- **Your data stays on your SSD.** CaseVault reads and writes the vault folder directly through the browser's File System Access API. The browser remembers only *which folder* to reconnect to, never its contents.
- **Works offline.** Install it as an app from GitHub Pages, or run the copy on the SSD. There's no build step and nothing to download at runtime; every library is bundled in `vendor/`.
- **Private by design.** No CDNs, web fonts, analytics, or network calls. A Content-Security-Policy restricts the page to its own files, the local AI engine on `127.0.0.1:11434` and, only when you choose to go online for research and drafting, `api.anthropic.com`, and only with text you reviewed and that had personal details replaced by placeholders.

**Open it:** https://t3rminal-cmd.github.io/casevault/ (Chrome or Edge on desktop), or `W:\Start-CaseVault.bat` (Firefox, or any browser).

| Browser | Mode |
|---|---|
| Chrome, Edge | **Direct**: the File System Access API reads and writes the SSD folder. No helper needed. |
| Firefox | **Helper**: `tools/casevault-helper`, a PowerShell script started by `Start-CaseVault.bat`. It needs no install or admin rights, listens on 127.0.0.1 only, serves the app, and reads/writes `CaseVault-Data`. |

The app detects the browser and picks the mode by itself. The data format on the SSD is identical in both.

## Features (v1.9)

- Cases with number, client, status, tags, and opened/closed dates; search and filter
- **Archive** a case (moved to `archive/` on the SSD after every file is copied and verified; opens read-only; restore any time) or **delete** it permanently (type the case number to confirm)
- Collapsible case list (Ctrl+\)
- Free-form notes (Markdown, with preview)
- **Document folders in every case**: Affidavits, Arrest Report, Supplementary Report, Case Report, Deconfliction, Drug Exhibits, Email, Ops Plan, Subpoena Response, Subject Information, Recordings, Vehicle Information, Maps, Other
- **Naming convention**: case folders `2026-<CaseNo>`, files `2026-<CaseNo> <Document type>.ext` (e.g. `2026-00123 Arrest Report.pdf`), with a type guess from the file name, verified moves and renames, and a one-click rename for older case folders
- **Department mail** (Mail tab): recipients locked to your department's domains, attachment size and case-number checks, a PII scan with a warning (typed confirmation for SSNs, DOBs, IDs, card and bank numbers), then an Outlook draft (`.eml`) with the attachments, saved in the case's Email folder and logged
- **Online research & drafting (optional, off by default)**: Claude via your subscription (copy & paste into claude.ai) or the Anthropic API; names and numbers replaced with placeholders before anything leaves, a review of the exact text, real values put back only on this PC, one reviewed request per send, auto-offline after 15 minutes, and an **outbound log** on the SSD
- **PII scanner**: SSNs, DOBs, IDs, passports, card/bank numbers, phones, emails, addresses, plates, VINs, case numbers, names after titles or in `LAST, First` form, plus each case's client and number and your own watch list
- **Memory indicator** in the header: app memory, the local AI model's GPU/RAM use, PC RAM and SSD free space (helper mode), and **Free AI memory**
- Timeline of dated events and deadlines, with overdue/upcoming highlighting across all cases
- File attachments copied onto the SSD, with in-app preview for PDFs, images, text, and media
- Autosave on every change with a **Saved to SSD** indicator; survives unplugging (changes wait and are written on reconnect)
- Daily backups of the vault index, and a self-healing case index
- **Offline Consistency Checker**: compares an affidavit against the case's reports, and the reports against each other
  - reads PDF (with OCR for scanned pages), **XFA (Adobe LiveCycle) PDF forms** field by field, DOCX, TXT, and photos
  - **Rules layer:** dates, times (12h/24h), names (spelling variants), case/report numbers, addresses, plates, phone numbers, amounts, and counts
  - **AI layer:** local Ollama; Supported / Contradicted / Not found, with every quote verified word-for-word against the report (answers that fail are discarded)
  - side-by-side results with click-to-source, High/Medium/Low severity, and Fix / Not an issue / Explained, saved to `checks/<date>-check.json`
  - AI profiles (Quick / Thorough / Light / Rules-only), auto-detected from installed models
- **Excel and CSV**: `.xlsx/.xls/.ods/.csv` open as tables with sheet tabs, and the checker reads them row by row with sheet + row locations (bundled SheetJS, loaded only when needed)
- **Privacy screen**: Ctrl+Shift+H, Esc twice, or **Hide** instantly covers the app (the tab title becomes "New Tab", media pauses, edits are saved). Optional 4–6 digit PIN, stored as a salted SHA-256 hash, and optional auto-hide after inactivity
- **Drafts with a local-AI copilot**: Markdown drafts per case, saved to `drafts/` on the SSD
  - an **AI suggestion** box under the cursor line (Tab accepts, Esc dismisses)
  - **Draft with AI** from the case details, timeline, notes and attached documents, never inventing facts and marking gaps as `[CONFIRM: ...]`
  - a checklist of placeholders
  - agency templates with `{{placeholders}}`, including your own details (`{{affiant.name}}` …) from **My details**
  - export to `.docx` (no library) or plain text
  - one-click consistency check of an affidavit draft

- **AI activity indicator** in the header (what the AI is doing, model, time, tokens/s), one shared AI queue, and small-GPU settings (context size per profile, `keep_alive` 10 minutes)
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
    files/<Document type>/   attached documents, copied in and named 2026-<CaseNo> <Type>.ext
    mail-log.json            department mail prepared from this case
    drafts/                  drafts: <slug>.md (Markdown, details in the first line)
    checks/                  consistency checks: <date>-check.json
      text-cache/            text read from documents (so OCR runs once)
  archive/<case-id>/         archived cases, same layout (read-only in the app)
  templates/                 your document templates (*.md)
  backups/                   dated snapshots of vault.json
  logs/                      outbound-YYYY-MM.json: what left this PC, when and where (never the text)
  secrets/                   the online AI key, only if you chose "Remember on SSD"
```

## Code layout

| Path | What |
|---|---|
| `index.html` | App shell and Content-Security-Policy |
| `css/app.css` | Styles (system fonts, light/dark) |
| `js/fs.js` | Folder-handle storage (IndexedDB, handle only) and SSD file helpers |
| `js/casefiles.js` | Document folders and the `2026-<CaseNo> <Type>` naming convention |
| `js/secure/pii.js` | PII scanner, redaction to placeholders, and putting the real values back |
| `js/secure/outbound.js` | The outbound gate: review screen, one-time tickets, host allow-list, leak check, outbound log |
| `js/secure/online-ui.js` | Online research & drafting page (claude.ai copy & paste, or Anthropic API) |
| `js/secure/mail.js`, `js/secure/mail-ui.js` | Department mail: domain rules, `.eml` Outlook draft builder, the Mail tab |
| `js/secure/settings-ui.js` | Vault panel: online features, PII watch list, department mail, outbound log |
| `js/ai/memory.js` | Memory indicator (app, Ollama model GPU/RAM, PC RAM and disk) |
| `js/vault.js` | Vault data model: cases, notes, timeline, files, index, backups, archive (verified folder moves) |
| `js/ai/activity.js` | AI activity tracker: header indicator, shared AI queue, tokens/s |
| `js/markdown.js` | Minimal, escaping Markdown previewer for notes |
| `js/app.js` | User interface, autosave, connect/reconnect |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable offline PWA |
| `js/helper-fs.js` | Helper mode: wraps the helper's API in FileSystemHandle-shaped objects |
| `js/checker/nlp.js` | Sentence splitting, similarity, BM25 retrieval, verbatim-quote finder |
| `js/checker/rules.js` | Layer 1: fact extraction and cross-document comparison |
| `js/checker/extract.js` | Text from PDF (pdf.js + OCR), DOCX, TXT, images (Tesseract) |
| `js/checker/xfa.js` | XFA (LiveCycle) PDF forms: reads the filled-in fields as checker text |
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
| `tools/casevault-helper/` | The Firefox helper (Windows PowerShell 5.1, 127.0.0.1 only); also serves in-browser models from `W:\webllm`, holds `Get-WebLLM-Model.ps1`, opens `.eml` mail drafts from a case's Email folder in Outlook, and reports RAM and disk space for the memory indicator |
| `tools/Get-WebLLM-Model.bat` | One-time download of an in-browser model onto the CV-AI drive |
| `tests/` | Unit tests (`node --test tests/*.test.js`) and a mock Ollama server |
| `scripts/check-no-case-data.sh` | CI guard: fails if anything resembling case data is committed |

Plain HTML, CSS, and JavaScript with classic `<script>` tags, so it also runs from `file://` (PDF reading and OCR need `http(s)`). To work on it locally, serve the folder (for example `python -m http.server`) and open it in Chrome or Edge. For the AI layer without a real model, run `node tests/mock-ollama.js`.

**Never commit case data.** `.gitignore` blocks it, and CI refuses to deploy if any slips through.

## Deployment

`.github/workflows/pages.yml` publishes the app to GitHub Pages on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
