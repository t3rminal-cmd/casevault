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

## Features (v1.22)

- **Searchable lists** you can also type into: IUCR code (from Common UCR), location code (Type of Location fills in), charges (the Illinois statutes from LE Cyber-Docs, also in Reference → Charges), gangs, victim, hair and eye color
- People get age (from the DOB), gender, gender identity, race, complexion and veteran; police personnel get Unit and a Role list; Notifications is a list (date, person notified, notified by); five Officer's Report lines can be left out; exhibit photos are labeled 1a, 1b…
- Ask AI box: smaller text, taller entry box, cleaner Model / Case lists, a short red local-only note. Vault menu icons lined up on the right in blue; folder paths shown as `cases | 2026-B1`; table headers keep their rounded corners
- Quick links: Blockchair, Mempool, TinEye, Google Images (OSINT); Chainalysis, Chicago Police Directives (LEO)

## Earlier (v1.21)

- **Privacy screen fix:** Esc can no longer get past the PIN, and the Ctrl+Shift+H / Esc Esc shortcuts are gone (Hide button and idle timer only)
- **Supplementary Report:** an include box on every part (untick what doesn't apply), victims and offenders with demographics (DOB, height, weight, hair, eyes, tattoos / scars, clothing), and lists for charges (statute and description), gangs (pick-list with write-in), persons not arrested, police personnel and vehicles (with Impound / Tow); Agency Report Number; evenly lined-up boxes
- **Exhibit photos:** add photos to an exhibit, view them, and get them in the PDF on portrait **Exhibit Attachments** pages
- **Deconfliction** table on the Details tab; a welcome **Overview**; icons after the words; Title Case buttons; **Field Notes**; NumLookup in OSINT; equal Reference / OSINT / LEO buttons; DEA 6, 7, 7a and 202; a straight full-width tab bar

## Earlier (v1.20)

- **Supplementary Report:** Report Fields laid out like a narcotics supplementary report (case numbers, offense, victims and offenders, assignment, update information and status, the officer's report lines, evidence, summary of investigation, approvals). **Print / PDF**, **Save PDF to Case**, and **Email for E-Sign** (the PDF has real signature fields for Adobe Fill & Sign)
- Evidence: exhibit number, inventory number, type, a long description, and narcotic type and weight for narcotics
- Title Case headings without parentheses, shorter hover boxes, status next to the red bell in the case list, a proper X next to Done in the Vault and Options, a longer summary box and clearer fonts in Report Fields

- **Formatted editing** in reports, field notes and the narrative: bold shows bold, underline underlined, headings, lists and tables as in Word, with no `**` on screen. Paste from Word keeps the formatting; copy (or Export → Copy for Word) pastes into Word formatted. A **Markdown** switch shows the marks; the files on the SSD stay the same Markdown

- **Report Fields** (Reports tab): offense, UCR and location codes, date/time/beat, victims and offenders, arrests, activity (Purchase, Surveillance, Investigation, Correction), evidence with **automatic exhibit numbers** shared by every case with the same agency case number, money and weights, vehicle, court and approvals, and a narrative. They fill `{{report.*}}` in templates, go to Draft with AI, and **Create report from fields** turns them into a report
- **Re-phrase** a sentence to DEA writing standards and **Review** a report for consistency, with totals (money and weights) checked by arithmetic
- New report starts from a dropdown (Blank / Template / Draft with AI); Draft with AI starts at the summary unless you tick **Header** (officer, ASA/AUSA, numbers)
- Templates: **Use**, **Download** (.docx), Edit, Delete, and **Save as a template** from any report; delete the field notes
- Files named `<year>-<case no.>-<file name>` with a **Document** column; **Title or Operation Name** on Details; the case list without the Open/Pending filter
- Ask AI: **History** of saved chats (open or delete), **Clear**; chats saved to the SSD. Mail settings Save button; same-size Save buttons in the Vault; green wave memory icon; tidy code cards in Reference

- **Reports** tab: the field notes and every draft in one list; Tab and Shift+Tab indent in notes and reports (kept in the preview and the Word export)

- Case tabs in working order (Details, Timeline, Drafts, Files, Mail, Notes, Checks); a red bell on the right of any case with an open deadline; an X to close every box; blue chat bubble for Ask AI and a ⋮ menu

- **One way to write numbers**: dates `12.01.2026` (typed or picked from a calendar), phones `123.456.7890`, SSNs `123.45.6789`
- **Free online AI options**: Google Gemini (free tier) and OpenRouter (free models) beside the Anthropic API, each with its own key, step-by-step guide and an honest note on what "free" means for privacy
- **Add another AI model** from the AI window (dolphin3 and other less-filtered models), with copy-ready commands
- Case list with the status in words, just the numbers (`100 | JH123456 | State`), a red bell for deadlines, and an adjustable width; square header buttons; one robot icon for everything AI; auto-hide after 15 minutes

- **A clean header**: logo and where the data is saved on the left, status icons in the middle (offline/online, AI model, memory, saved to SSD; details on hover), Ask AI, Hide and a **menu** on the right (Reference, Library, Vault, Theme, Options, Contact Dev)
- **Options**: zoom and brightness per PC, and **Dev Tools → Make it fictitious**, which swaps names, phone numbers, addresses and other personal details in a real template or report for fillers (John Doe, 555-0100…), with an optional local-AI pass, then saves it as a template or to the Library
- **Contact Dev**: a bug report by email or web form, with the app version, that refuses to send case details
- **Suspects** (name, DOB with the age worked out, residence, role) and an **agency case number** on the Details tab; client is State, Federal or Other; `{{suspect.*}}` in templates
- A case list with a status icon, a **red bell** for overdue or near deadlines, and the numbers and client under the title
- A **matrix-rain** privacy screen (blue 1s and 0s on white) with a terminal-style PIN prompt
- **Contacts** on each case's Details tab: case officer, ASA/AUSA, and others (finance, asset forfeiture, narcotic team supervisor…), with email and phone; usable in templates
- **Ask AI**: a floating chat with the AI on this computer, like claude.ai but offline, that stays open while you write drafts or notes (Insert puts an answer at your cursor); pick any installed model (including a less-filtered one, see docs/AI-SETUP.md) and optionally a case, whose details, timeline, notes and file passages go with each question; save the conversation to a case
- **The LE Cyber-Docs look**: icons throughout (bundled Bootstrap Icons), the Poppins font, rounded cards, and **light / dark / automatic** themes with a switch in the header; a Vault settings panel with a section list
- **Reference** (from LE Cyber-Docs): narcotic **value calculator** and **street value chart** (HIDTA 2022), **incident location codes** and **commonly used UCR** codes
- **Quick links** at the bottom of the Overview: Reference, **OSINT** (MaxMind IP, Fingerprint) and **LEO** (Accurint, Kodex, Chicago HIDTA, your own); hide any, edit addresses, add your own; they open in a new tab and CaseVault never contacts them
- **Library for the AI** (Vault → Library): sample DEA-6/7/202 reports, warrants and directives the AI learns to write from (never their facts), and editable **writing behaviors** with **DEA-6 style** as the default
- Hover boxes explain every button, and an ⓘ holds each longer explanation; file previews fill the window; the layout is centred and symmetric from a phone to 1920×1080 and up
- Cases with a **file number** (shared by several cases) and a **case number**, client, status, tags, and opened/closed dates; search and filter
- **Case status with a purpose**: *Pending* records what you're waiting on and a follow-up date (put on the timeline); **Close case…** records a disposition (cleared by arrest, exceptionally cleared with reason, unfounded, inactive, referred, other) after listing loose ends; **Reopen** keeps the history
- **Arrest details** tab: arrestees, arrest facts and charges, saved to `arrest.json` and filling `{{arrest.*}}` placeholders for arrest reports
- **Archive** a case (moved to `archive/` on the SSD after every file is copied and verified; opens read-only; restore any time) or **delete** it permanently (type the case number to confirm)
- Collapsible case list (Ctrl+\)
- Free-form notes (Markdown, with preview)
- **Document folders in every case**: Case Overview, Case Initiation, Affidavit Drafts/Final, Warrant Drafts/Final, Arrest Report, Supplementary Report, Case Report, Deconfliction, Drug Exhibits, Other Exhibits, Email, Ops Plan, Subpoena Drafts/Response, Subject Information, Recordings (Video, Audio), Vehicle Information, Maps, Case Closing, Other; Arrange folders (up/down or drag) and drag to reorder files, drop a file on a folder to move it, sortable table
- **Formatting bar** in Notes and Drafts: bold, italic, underline, headings, lists and tables (also in the Word export)
- **Naming convention**: case folders `2026-<CaseNo>`, files `2026-<CaseNo> <Document type>.ext` (e.g. `2026-00123 Arrest Report.pdf`), with a type guess from the file name, verified moves and renames, and a one-click rename for older case folders
- **Department mail** (Mail tab): recipients locked to your department's domains, attachment size and case-number checks, a PII scan with a warning (typed confirmation for SSNs, DOBs, IDs, card and bank numbers), then an Outlook draft (`.eml`) with the attachments, saved in the case's Email folder and logged; discard a draft, or delete a saved Outlook draft
- **Online research & drafting (optional, off by default)**: Claude via your subscription (copy & paste into claude.ai) or the Anthropic API (optional key with Add/Replace/Test/Remove, kept for the session or saved on the SSD locked with a passphrase, and an in-app step-by-step guide); names and numbers replaced with placeholders before anything leaves, a review of the exact text, real values put back only on this PC, one reviewed request per send, auto-offline after 15 minutes, and an **outbound log** on the SSD
- **PII scanner**: SSNs, DOBs, IDs, passports, card/bank numbers, phones, emails, addresses, plates, VINs, case numbers, names after titles or in `LAST, First` form, plus each case's client and number and your own watch list
- **Memory indicator** in the header: app memory, the local AI model's GPU/RAM use, PC RAM and SSD free space (helper mode), and **Free AI memory**
- Timeline of dated events and deadlines, with overdue/upcoming highlighting across all cases
- File attachments copied onto the SSD, with in-app preview for PDFs, images, text, media and **Word (.docx)**
- Autosave on every change with a **Saved to SSD** indicator; survives unplugging (changes wait and are written on reconnect)
- Daily backups of the vault index, and a self-healing case index
- **Offline Consistency Checker**: compares an affidavit against the case's reports, and the reports against each other
  - reads PDF (with OCR for scanned pages), **XFA (Adobe LiveCycle) PDF forms** field by field, DOCX, TXT, and photos
  - **Rules layer:** dates, times (12h/24h), names (spelling variants), case/report numbers, addresses, plates, phone numbers, amounts, and counts
  - **AI layer:** local Ollama; Supported / Contradicted / Not found, with every quote verified word-for-word against the report (answers that fail are discarded)
  - side-by-side results with click-to-source, High/Medium/Low severity, and Fix / Not an issue / Explained, saved to `checks/<date>-check.json`
  - AI profiles (Quick / Thorough / Light / Rules-only), auto-detected from installed models
- **Excel and CSV**: `.xlsx/.xls/.ods/.csv` open as tables with sheet tabs, and the checker reads them row by row with sheet + row locations (bundled SheetJS, loaded only when needed)
- **Privacy screen**: **Hide** (or the idle timer) instantly covers the app; Esc can't uncover it (the tab title becomes "New Tab", media pauses, edits are saved). Optional 4–6 digit PIN, stored as a salted SHA-256 hash, and optional auto-hide after inactivity
- **Drafts with a local-AI copilot**: Markdown drafts per case, saved to `drafts/` on the SSD
  - an **AI suggestion** box under the cursor line (Tab accepts, Esc dismisses)
  - **Draft with AI** from the case details, timeline, notes and attached documents, never inventing facts and marking gaps as `[CONFIRM: ...]`
  - a checklist of placeholders
  - agency templates with `{{placeholders}}`, including your own details (`{{affiant.name}}` …) from **My details** and the arrest details; **import a Word form** as a template, with a clickable placeholder list in the editor
  - export to `.docx` (no library) or plain text
  - one-click consistency check of an affidavit draft

- **AI profile per PC**: Auto uses the Quick model on a PC whose graphics card runs it (Beelink) and Light where the AI runs on the processor (L14)
- **Self-test** (Vault → Maintenance): readers, OCR, checker, privacy and the AI engine checked in a minute with made-up documents
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
| `js/secure/apikey.js`, `js/secure/apikey-ui.js` | Anthropic API key: format check, masking, passphrase lock (AES-GCM), and the Add / Unlock / Test / Remove card with the step-by-step guide |
| `js/secure/online-ui.js` | Online research & drafting page (claude.ai copy & paste, or Anthropic API) |
| `js/secure/mail.js`, `js/secure/mail-ui.js` | Department mail: domain rules, `.eml` Outlook draft builder, the Mail tab |
| `js/secure/settings-ui.js` | Vault panel: online features, PII watch list, department mail, outbound log |
| `js/ai/memory.js` | Memory indicator (app, Ollama model GPU/RAM, PC RAM and disk) |
| `js/vault.js` | Vault data model: cases, notes, timeline, files, index, backups, archive (verified folder moves) |
| `js/ai/activity.js` | AI activity tracker: header indicator, shared AI queue, tokens/s |
| `js/ai/hardware.js` | AI profile per PC, and what Auto picks from the GPU |
| `js/selftest.js` | Self-test with built-in made-up documents |
| `js/markdown.js` | Minimal, escaping Markdown previewer for notes |
| `js/report-pdf.js` | The Supplementary Report as a PDF (its own small PDF writer; signature fields for e-sign) |
| `js/rich-editor.js` | Formatted view for notes and reports: edits in Word-like form, saved as Markdown; paste from Word, copy for Word |
| `js/app.js` | User interface, autosave, connect/reconnect |
| `js/theme.js` | Light / dark / automatic theme (loaded first, so the page never flashes) |
| `js/icons.js`, `js/icons-data.js` | Icons as inline SVG (a subset of Bootstrap Icons, made by `scripts/make-icons.js`) |
| `js/reference/ref-data.js`, `js/reference/reference.js`, `js/reference/ref-ui.js`, `js/reference/links.js` | Reference: the data (values, codes), the logic (calculator, search, AI text), the screens and the Quick links (Reference, OSINT, LEO) |
| `js/library.js`, `js/library-ui.js` | The Library the AI learns from, and the writing behaviors (DEA-6 by default) |
| `js/ai/chat.js`, `js/ai/chat-ui.js` | Ask AI: the chat's messages and case material, and the floating chat box |
| `js/timefield.js` | Time boxes: type a time or pick it and press Set time |
| `js/options.js` | Menu → Options (zoom, brightness, Dev Tools "Make it fictitious") and Contact Dev |
| `js/format-bar.js` | The formatting bar over Notes and Drafts |
| `js/tooltip.js` | Hover boxes for every button |
| `js/closing.js`, `js/closing-ui.js` | Status rules, Pending follow-up, Close case (dispositions, loose ends), Reopen, the Arrest details tab and `{{arrest.*}}` / `{{closure.*}}` values |
| `js/docxview.js` | Word (.docx) to a read-only preview, and to Markdown for template import |
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
| `vendor/` | Bundled pdf.js, Tesseract.js, SheetJS, WebLLM, the Bootstrap Icons license and the Poppins font (see `vendor/README.md` for versions, licenses and provenance) |
| `tools/Start-CaseVault.bat` | Launcher for the CV-AI partition: starts the helper and Ollama |
| `tools/casevault-helper/` | The Firefox helper (Windows PowerShell 5.1, 127.0.0.1 only); also serves in-browser models from `W:\webllm`, holds `Get-WebLLM-Model.ps1`, opens `.eml` mail drafts from a case's Email folder in Outlook, and reports RAM and disk space for the memory indicator |
| `tools/Get-WebLLM-Model.bat` | One-time download of an in-browser model onto the CV-AI drive |
| `tests/` | Unit tests (`node --test tests/*.test.js`) and a mock Ollama server |
| `scripts/check-no-case-data.sh` | CI guard: fails if anything resembling case data is committed |

Plain HTML, CSS, and JavaScript with classic `<script>` tags, so it also runs from `file://` (PDF reading and OCR need `http(s)`). To work on it locally, serve the folder (for example `python -m http.server`) and open it in Chrome or Edge. For the AI layer without a real model, run `node tests/mock-ollama.js`.

**Never commit case data.** `.gitignore` blocks it, and CI refuses to deploy if any slips through.

## Deployment

`.github/workflows/pages.yml` publishes the app to GitHub Pages on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
