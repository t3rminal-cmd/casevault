# Using CaseVault

CaseVault keeps your case files — details, notes, a timeline of events and deadlines, attached documents, and consistency checks — **on your SSD only**. The app runs in Chrome, Edge, or Firefox, works without internet, and never uploads anything.

If the SSD isn't set up yet, start with [SSD-SETUP.md](SSD-SETUP.md).

---

## Opening CaseVault

CaseVault picks the right way to reach your SSD for the browser you use. The data on the SSD is exactly the same either way.

| Browser | Mode | How to open CaseVault |
|---|---|---|
| **Google Chrome**, **Microsoft Edge** | **Direct**: the browser opens the SSD folder itself | The installed app (below), the SSD copy, or the launcher |
| **Firefox** | **Helper**: a small helper program on the SSD reads and writes for the browser | Double-click **`W:\Start-CaseVault.bat`** (see [AI-SETUP.md](AI-SETUP.md)). It opens CaseVault at `http://127.0.0.1:8517/`. |

If you open the hosted page or the SSD copy in Firefox, CaseVault explains that you need to start the launcher.

In Chrome and Edge you have these ways to open it:

### Installed app (recommended)

1. Visit **https://t3rminal-cmd.github.io/casevault/** once while online.
2. Click the **Install** icon at the right end of the address bar (or ⋮ menu → *Cast, save and share* → *Install page as app*).
3. From then on, open **CaseVault** from the Start menu. It works with no internet, because the whole app is stored by the browser. Your case data is not; that stays on the SSD.

### Offline copy on the SSD (fallback)

For a PC that has never visited the site, or if GitHub is unreachable:

1. On GitHub, open the repository, click **Code → Download ZIP**, and extract it.
2. Copy the extracted files into **`V:\CaseVault-App\`**, so that `V:\CaseVault-App\index.html` exists.
3. Double-click `V:\CaseVault-App\index.html` and choose Chrome or Edge to open it. It works the same way.

The installed app and the SSD copy each ask you to pick the vault folder once. The browser keeps their permissions separate.

> **PDF reading and OCR** in the Consistency Checker need the installed app or the launcher (`http://127.0.0.1:8517/`). A copy opened straight from the SSD by double-clicking `index.html` can't load them, because browsers restrict `file://` pages. Everything else works there.

### Firefox (helper mode)

1. Plug in the SSD and unlock V:.
2. Double-click **`W:\Start-CaseVault.bat`** and leave its window open.
3. Firefox opens CaseVault at **http://127.0.0.1:8517/** (make Firefox your default browser, or paste that address into it). Bookmark it.
4. There is no folder to pick. The helper finds the **CASEVAULT** partition by itself, whatever its drive letter. The first time, click **Create vault here**.

When you're done, close CaseVault, then close the helper window, then eject the SSD.

## First time: create your vault

1. Plug in the SSD and unlock **V:** with your BitLocker password.
2. Open CaseVault and click **Choose folder…**.
3. Select the **CASEVAULT (V:)** drive itself and click **Select Folder**. When the browser asks, allow CaseVault to **view and edit files**.
4. CaseVault says *No vault found*. Click **Create vault here**. It creates `V:\CaseVault-Data\` with `vault.json`, `cases\`, and `backups\` inside.

## Every day

1. Plug in the SSD and unlock V:.
2. Open CaseVault. In Chrome or Edge, click **Reconnect**, then **Allow** (or *Allow on every visit*, if offered). In Firefox, start `W:\Start-CaseVault.bat` and CaseVault opens connected.

   Browsers ask for this permission once per session. It's what stops any other website from ever touching your drive.
3. Work normally. When you're done, wait for **✓ Saved to SSD**, close CaseVault, and **safely eject** the SSD.

If the SSD isn't plugged in, you'll see **"Drive not connected. Plug in your SSD and click Reconnect."** Plug it in, unlock it, and click **Reconnect**.

If Windows gave the drive a different letter and Reconnect can't find it, click **Choose folder…** and pick `CaseVault-Data` on the SSD once. (In Firefox the helper finds the new letter by itself.)

If the helper window was closed while Firefox was open, CaseVault shows **"The CaseVault helper is not running."** Start `W:\Start-CaseVault.bat` again and click **Reconnect**. Changes you made meanwhile are kept in the window and saved on reconnect.

## Cases

- **+ New case** asks for a title (required), case/file number, client, status, opened date, and tags.
- The **left list** shows open and pending cases, most recently changed first. Use the search box (title, number, client, or tag) and the filter to find others.
- **Details** tab: edit any field. Setting the status to *Closed* or *Archived* fills in the closed date for you.
- **Status** values: *Open*, *Pending*, *Closed*, *Archived*. Archive a case instead of deleting it when you might need it again.
- **Delete case** (at the bottom of Details) permanently removes the case folder and every attached file from the SSD. You must type `DELETE` to confirm.

The **Overview** screen (click **CaseVault** at the top left) shows counts by status, the next deadline for each active case, and recently updated cases.

## Notes

The **Notes** tab is a large free-form page, saved as `notes.md` in the case folder. You can use simple formatting and check it with **Preview**:

```
# Heading
**bold**, *italic*, `code`
- bullet point
1. numbered point
> quoted text
---            (a divider line)
```

## Timeline

Add dated **Events** (things that happened) and **Deadlines** (things that are due), with an optional time and note.

- Entries are always sorted by date.
- Deadlines show *due today*, *in N days* (amber within a week), or *N days overdue* (red).
- Tick the checkbox on a deadline when it's done. It's crossed out and no longer counts as upcoming.
- **Edit** loads an entry back into the form. **Delete** removes it after you confirm.
- Each case's next open deadline also appears in the left list and on the Overview screen.

## Files

On the **Files** tab, drag files onto the box or click **choose files**. They are **copied** into the case's `files` folder on the SSD, and your originals aren't changed. If a file with the same name already exists, the copy is named `name (2).pdf` rather than replacing it.

- **Open** previews PDFs, images, text, audio, and video right inside CaseVault. Excel and CSV files open as tables (see below).
- Other types (Word, and so on) can't be previewed. CaseVault shows you where the file is on the SSD, for example `CaseVault-Data\cases\20260928-ab12cd\files\statement.docx`, so you can open it from File Explorer.
- **Delete** permanently removes the file from the SSD after you confirm.

### Excel and CSV files

Attach `.xlsx`, `.xls`, `.ods` and `.csv` files like any other file.

- **Open** shows each sheet as a scrollable table with the sheet names as tabs, Excel-style column letters, and the real row numbers. Very large sheets show the first 2,000 rows; open the file in Excel to see everything.
- CSV files keep their values exactly as written. A badge number `0012` stays `0012`, and dates aren't reformatted.
- Only cell values are read. Formulas are never run, and macros in `.xlsm` files are ignored.
- The spreadsheet reader (SheetJS) is part of CaseVault and loads only when you open a spreadsheet. Nothing is downloaded.
- **Consistency checks** read spreadsheets row by row, as in `Evidence row 5: Item=17; Plate=ABC-1284`. A flag points at the sheet and row. **Open original** opens the table with that row highlighted.

### XFA PDF forms (Adobe LiveCycle)

Some agency forms are *XFA* PDFs, made with Adobe LiveCycle Designer. In Chrome, Edge or Firefox's own PDF viewer they only say *"Please wait... upgrade to the latest version of Adobe Reader"*, because the real content is stored as form data inside the file. CaseVault reads that form data itself.

- **Open** recognises an XFA form and draws it inside CaseVault, read-only. The bar above it says *XFA form (Adobe LiveCycle)*. **Show filled-in fields** switches to a plain list of every filled-in field, in form order.
- If the form can't be drawn (some complex forms), CaseVault shows the list of filled-in fields instead.
- Empty fields, and image fields such as signatures and photos, are left out of the list.
- An XFA form is never run through OCR: its "Please wait" page has nothing to read.
- A password-protected (encrypted) XFA form is read through the PDF reader instead. If nothing can be read from it, the check says so.

## Saving

There's no Save button. **Every change is written to the SSD automatically**, within about a second. The indicator at the top right shows:

| Indicator | Meaning |
|---|---|
| **Saving…** (amber) | A change is being written. |
| **✓ Saved to SSD 14:02:31** (green) | Everything is on the SSD, as of that time. |
| **Not saved — reconnect SSD (n)** (red) | The SSD was unplugged or locked. Your changes are held in this window. Plug in, unlock, and click **Reconnect**, and they're written straight away. **Don't close the window until it turns green.** |

`Ctrl + S` writes any pending change immediately, if you like the habit.

## Consistency checks

The **Checks** tab compares an affidavit draft (or any document) against the reports attached to the same case. It also cross-checks the reports against each other.

> ⚠ **AI-assisted review. Verify every flag against the source.** A check is a second pair of eyes, not a verdict. No flags does not prove a document is accurate.

### Running a check

1. Attach the affidavit and the reports on the **Files** tab. PDF (including scanned PDFs and XFA forms), Word (`.docx`), Excel (`.xlsx`, `.xls`), CSV, TXT, and photos (PNG/JPG) can be checked. Old `.doc` files must be saved as `.docx` or PDF first. To check a draft you're writing in CaseVault, use **Run consistency check** in the Drafts tab instead.
2. Open **Checks**. Under **Document to check**, pick the affidavit. (Choose *none* to only compare the reports with each other.)
3. Tick the reports to compare against. All of them are ticked by default.
4. **Include AI review** is available when the header shows **AI: Connected**. Without it, the rule-based checks still run.
5. Click **Run check**. A window shows each step: reading each document (scanned pages go through OCR), the rule checks, then the AI review statement by statement. **Cancel** stops the check. If the AI review was already under way, what it found so far is saved.

The text read from each document is kept on the SSD (`checks\text-cache`), so re-running a check is quick. OCR only runs again if the file changes, or when a newer CaseVault reads that kind of file better (v1.8 re-reads PDFs once, for XFA forms).

### What gets checked

**Rules (always).** CaseVault pulls hard facts out of every sentence and compares them across documents:

- dates (03/14/2026 = March 14, 2026 = 14 March 2026)
- times (9:40 PM = 21:40 = 2140 hours)
- names, including spelling variants such as *Diaz / Dias* or *Katherine / Catherine*
- case and report numbers
- addresses (*1420 Oak Street* = *1420 Oak St.*)
- licence plates
- phone numbers
- money amounts
- counts (*three shots* vs *two shots*)

**XFA forms** are read field by field: each filled-in field becomes one line such as `Reporting officer: Officer Alex Sample`, using the form's own captions (or the field name when there's no caption). A repeated section, such as a timeline table, gives one line per row: `Timeline row 2: Date=03/14/2026; Type=Interview; Narrative=...`. A flag from a form points at *page 1* and the field or row, for example `Report.pdf · page 1 · Timeline row 2`. **Open original** lists the form's fields with that one highlighted.

**No usable text.** If a document gave no text at all (an empty scan, or an XFA form whose fields couldn't be read), a warning box at the top of the results says it wasn't compared. A check with no flags against that document means nothing.

**AI review (optional).** For each statement in the affidavit, CaseVault finds the most relevant report passages. The local AI decides whether the statement is **Supported**, **Contradicted**, or **Not found in reports**, and it must quote the exact report sentence it relied on. **If that quote can't be found word-for-word in the report, the answer is thrown away**, and the results tell you how many were. This stops the AI from inventing sources.

### Reading the results

| Severity | Meaning | From |
|---|---|---|
| **High** | Hard fact mismatch: a different date, time, number, plate, amount or count in a matching statement, or a name spelled two ways | Rules |
| **Medium** | Contradiction: a report says something that conflicts with the statement | AI |
| **Low** | Unsupported: a fact or statement that no report mentions | Rules and AI |

Each flag shows the **statement** (left) and the **source** sentence with the document name and page (right), with the differing words highlighted. **Click either quote** to open the document at that place, with the sentence highlighted. **Open original** shows the actual file, at that page for PDFs.

Flags from OCR'd pages carry a warning. OCR can misread characters (for example *Elm* as *EIm*), so check those against the original.

### Marking flags

Mark every flag as one of:

- **Fix**: the document needs correcting.
- **Not an issue**: a false alarm.
- **Explained**: a note box opens. Write why it's fine or how it was resolved.

Click the same button again to set a flag back to open. Use the filters to show open or resolved flags, a severity, or only rule or AI flags. Everything saves to the SSD automatically.

### Where checks are saved

Each run is saved as `CaseVault-Data\cases\<case>\checks\<date>-check.json`. A second run on the same day is saved as `<date>-2-check.json`, and so on. Past checks are listed on the Checks tab, newest first, with their counts and how many flags are still open.

The AI engine setup (profiles, models, the launcher) is in [AI-SETUP.md](AI-SETUP.md). Click the **AI:** status in the header to choose a profile.

## Privacy screen

To hide CaseVault instantly, for example when someone walks up to your desk, do any of these:

- press **Ctrl + Shift + H**;
- press **Esc twice** quickly (within half a second);
- click **Hide** at the top right.

A plain grey screen covers the whole app, with no case names or data on it. The browser tab's title changes to **New Tab** and its icon goes blank. Audio and video pause, any open file preview closes, and any unsaved edits are written to the SSD first.

**To come back:** click anywhere. If you set a PIN, type it and press Enter (it also unlocks by itself once you've typed 6 digits). After 5 wrong PINs you have to wait 30 seconds.

**Settings** (in **Vault → Privacy screen**):

- **Set PIN / Change PIN / Remove PIN.** 4 to 6 digits. It's stored in `vault.json` on the SSD as a salted SHA-256 hash, never the PIN itself, so it goes with the SSD to every PC.
- **Hide automatically after** 1 to 30 minutes without mouse or keyboard activity. Off by default.

> The privacy screen only hides what's on the screen. It isn't encryption, and anyone at the PC could close the browser tab. **For real security when you leave, press Windows key + L to lock the PC.**

In Firefox, Ctrl + Shift + H normally opens the History window. While CaseVault is the active tab, CaseVault uses it instead. If it ever doesn't respond, use Esc Esc or the Hide button.

## Drafts

The **Drafts** tab is where you write documents for the case: affidavits, subpoenas, memos, case summaries. Drafts are saved as Markdown files in `CaseVault-Data\cases\<case>\drafts\` on the SSD. They autosave like notes, with the same **Saved to SSD** indicator.

### Starting a draft

Give it a title and a type (Case summary, Affidavit, Subpoena, Memo, Other), then choose how to start:

- **Blank.**
- **From a template.** Your agency's formats, stored in `CaseVault-Data\templates\` (see *Templates* below). Case details such as the case number are filled in for you.
- **Draft with AI.** Writes a first draft from this case's material (needs **AI: Connected** in the header).

The editor understands simple Markdown (`#` headings, `**bold**`, `1.` numbered paragraphs, `-` bullets). **Preview** shows it formatted.

### [CONFIRM: ...] placeholders

Anything that still needs checking is written as `[CONFIRM: what is needed]`, for example `[CONFIRM: affiant badge number]`. Templates add them for missing case details, and the AI adds them for any fact it doesn't find in the material.

The **To confirm** panel beside the editor lists every placeholder with its line. Click one to jump to it and select it, then type the checked fact over it. A draft is ready when the panel says *Nothing left to confirm*.

### AI suggestions while you type

With **AI suggestions** ticked in the toolbar, pausing for a moment at the end of a line shows a short grey suggestion for how the sentence might continue.

- **Tab** accepts it.
- **Esc** (or typing something else) dismisses it. If you type the first letters of the suggestion, the rest stays.
- It uses the smallest AI model you have installed, so it's quick, and it only ever talks to the AI engine on this computer.
- It switches itself off when the header shows **AI: Offline** or **AI: Rules-only**. Untick it any time; CaseVault remembers the choice.

### Draft with AI

Click **Draft with AI…** in the editor (or pick it when creating a draft) and choose:

- **Document type** and optionally a **template** to follow.
- **What to use:** the case details (always), the timeline, the notes, and any attached documents. For long documents, CaseVault picks the passages most relevant to the draft.
- Optional **instructions**, such as "focus on the events of March 14".
- **Replace** the current text, or **add** below it.

The draft appears in the editor as it's written. **Stop** keeps what has been written so far.

The AI is told to use **only** the case material you selected, to keep facts and numbers exactly as written in the reports, and to write `[CONFIRM: ...]` for anything missing (names, dates, badge numbers, the court) rather than invent it.

AI-written drafts always show this banner:

> ⚠ AI-generated draft. Verify every fact against the source before signing or filing.

Read an AI draft as a starting point. It can still misstate things, so check every sentence against the reports.

### Checking a draft

On an **Affidavit** draft, **Run consistency check** checks the draft against every document attached to the case, using the same checker as the Checks tab (rules, plus AI review when connected). Click a flag to see the sentence in the draft, and **Open draft** to go back and fix it. The draft's own exported copies are left out, so the draft is never compared with itself.

### Export

**Export ▾** in the editor offers:

- **Save .docx to case files (SSD).** A Word file is added to the case's Files tab. Recommended: it stays on the encrypted SSD.
- **Save .docx to this computer…** Chrome/Edge ask where to save it. Firefox uses its normal download. Choose a folder on the SSD if you don't want a copy on the PC.
- **Copy as plain text.** Copies the text without Markdown symbols, to paste into another program.

The Word file keeps headings, paragraphs, bold and italic, bullet and numbered lists. Any `[CONFIRM: ...]` left in the text is highlighted yellow in Word so it can't be missed.

### Templates

Manage templates in **Vault → Templates**:

- **Add generic starter templates** adds an affidavit, a subpoena and a case summary. They're **generic examples, not legal forms**. Replace them with your agency's approved formats.
- **New template** or **Import .md…** to add your own, and **Edit / Delete** to change them. Each template is a Markdown file in `CaseVault-Data\templates\` on the SSD.

Placeholders you can use in a template:

| Placeholder | Becomes |
|---|---|
| `{{case.title}}`, `{{case.number}}`, `{{case.client}}`, `{{case.status}}`, `{{case.tags}}` | The case's details |
| `{{case.opened}}`, `{{case.closed}}` | The case's dates |
| `{{today}}` / `{{today.iso}}` | Today, as *September 28, 2026* / *2026-09-28* |
| `{{confirm: badge number}}` | `[CONFIRM: badge number]` |

A placeholder with no value (for example a case without a client) becomes `[CONFIRM: case.client]`, so nothing missing slips through.

## Backups

- The first time you connect each day, CaseVault copies `vault.json` (the case list and settings) to `CaseVault-Data\backups\vault-YYYY-MM-DD.json`. It keeps the newest 30. You can change that under **Vault** at the top right, and **Back up now** makes an extra copy.
- Those backups cover the *index*, not the cases themselves. To protect your cases, **regularly copy the whole `V:\CaseVault-Data` folder** to a second BitLocker-encrypted drive stored somewhere else.
- If `vault.json` is ever damaged, restore it from a backup: copy the newest `backups\vault-….json` over `CaseVault-Data\vault.json`. Then click **Vault → Rebuild case index**. CaseVault always rebuilds the list from the case folders when it opens, so the case list repairs itself.

## What is stored where

| Where | What |
|---|---|
| **SSD, `V:\CaseVault-Data\`** | All case data: details, notes, timelines, files, drafts, consistency checks and the text read from documents, templates, settings (including the privacy-screen PIN hash), backups. |
| **SSD, `W:\`** | The launcher, the helper, the AI engine and its models. No case data. |
| **The browser on this PC** | The CaseVault app files (so it opens offline), and in Chrome/Edge a *pointer* to the vault folder so it can offer **Reconnect**. No case data. |
| **GitHub** | Only the app's code. Case data can never be committed; the repository blocks it. |
| **The internet** | Nothing. The only other program CaseVault talks to is the AI engine (and, in Firefox, the helper) on this same computer, at `127.0.0.1`. |

To make a PC forget the vault folder, open **Vault → Disconnect**.

## Updating CaseVault

- **Installed app:** updates download automatically the next time you open it online. You'll see *"A CaseVault update was installed"*. Reload when convenient.
- **SSD copy (also what the Firefox helper serves):** download the ZIP again and replace the files in `V:\CaseVault-App\`. Your data in `CaseVault-Data` is separate and isn't affected. Also copy the new `tools\` files to W: (see [AI-SETUP.md](AI-SETUP.md)).

## Troubleshooting

| Problem | What to do |
|---|---|
| *In this browser, CaseVault runs through the CaseVault helper* | You're in Firefox. Start `W:\Start-CaseVault.bat`, which opens `http://127.0.0.1:8517/`. |
| *The CaseVault helper is not running* | Start `W:\Start-CaseVault.bat` and click **Reconnect**. |
| *AI: Offline* in the header | Start `W:\Start-CaseVault.bat`, then click the pill → **Check again**. Checks still run with rules only. |
| *Reading PDFs needs the installed app or the helper* | You opened `index.html` straight from the SSD. Use the installed app or the launcher address instead. |
| Ctrl + Shift + H does nothing | Click in the CaseVault page first (the shortcut only works while CaseVault is the active tab), or use Esc Esc or the **Hide** button. |
| I forgot the privacy-screen PIN | Reload the page (F5). The screen is gone, and you'll be asked to reconnect in Chrome/Edge. Then set a new PIN under Vault → Privacy screen. |
| No grey AI suggestions appear | The header must show **AI: Connected**, and **AI suggestions** must be ticked. Suggestions only appear when the cursor is at the end of a line. |
| *Draft with AI* is greyed out | Start `W:\Start-CaseVault.bat` so the AI engine runs, then click the AI pill → **Check again**. |
| A check says a file was *Skipped* | It couldn't be read (damaged, password-protected, or an unsupported type). Save it as PDF or DOCX and attach it again. |
| *Drive not connected* | Plug in the SSD, unlock V: with the BitLocker password, then click **Reconnect**. |
| Reconnect keeps failing | The drive letter probably changed. Click **Choose folder…** and pick `CaseVault-Data` (or the drive's root). |
| *No vault found in "…"* | You picked a folder that isn't the vault. Choose the CASEVAULT drive or `CaseVault-Data`. Only click **Create vault here** for a brand-new vault. |
| *This vault was saved by a newer version* | Update the app (reload the installed app while online, or refresh the SSD copy). |
| A case disappeared from the list | Click **Vault → Rebuild case index**. If its folder is still in `cases\`, it comes back. |
| *Not saved — reconnect SSD* | See **Saving** above. Keep the window open, reconnect, and wait for green. |

## When Ollama isn't running

If Ollama isn't running, CaseVault can use a small **in-browser AI model** instead, if one is on the SSD and CaseVault was opened through `W:\Start-CaseVault.bat`. The header then shows **AI: Connected (In-browser · …)**. The first AI request loads the model from the SSD, with a progress message, which can take a minute. See [AI-SETUP.md](AI-SETUP.md), section 8.

Without Ollama or an in-browser model, the consistency checker uses its rule-based layer only, and Draft with AI and suggestions are unavailable.

**Not built yet:** using the in-browser AI from the hosted/installed app *without* the launcher (it needs a way to read the models from W: directly).
