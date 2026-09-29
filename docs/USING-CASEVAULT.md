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

## Look and theme

The header has, from left to right: the vault folder, the **Offline** / **AI** / **Saved to SSD** indicators, **Reference**, **Hide** (privacy screen), the **theme button**, and **Vault**.

- **Theme button** (half circle, sun or moon): switches between *automatic* (follows Windows' light or dark setting), *light* and *dark*. Each PC remembers its own choice in the browser; it's a display preference, not case data.
- Icons mark every tab, button and document folder, and each file in a case shows an icon for its type (PDF, Word, Excel, picture, audio, video, email).
- **Point at a button** (or reach it with Tab) to see what it does in a hover box. Buttons show just an icon and a short name; the explanation is in the hover box.
- Labels have no brackets, and the longer explanations aren't printed on the page: an **ⓘ** next to a heading, label or box holds them. Point at it (or Tab to it) to read it. In the Vault, pointing at a section's heading shows what that section is for, and pointing at a box in **My details** shows which `{{affiant.…}}` placeholder it fills.
- **Opening a file** (the eye button) shows it in a window that fills almost the whole screen, so wide Word tables, spreadsheets and PDFs aren't cut off.
- **Ask AI** in the header opens a chat with the AI on this computer (see *Ask AI*).
- The page is centred and uses the width of the screen, from a phone up to 1920×1080 and larger. Case actions are same-size buttons in one row.
- The **Overview** shows your case counts, then, each under a line: **Upcoming deadlines**, **Recently updated**, and **Quick links** (see below).
- On a narrow window the header buttons shrink to their icons.
- **Vault** opens the settings. The list on its left (This vault, Backups, Privacy screen, My details, Templates, Library, AI writing behavior, Quick links, Online features, Always hide, Department mail, Outbound log, Maintenance) jumps to each section, and follows along as you scroll. **Done** is at the top right.

### Quick links

At the bottom of the Overview, in three tabs:

- **Reference:** Incident location codes, Commonly used UCR and the Narcotic calculator (CaseVault's own pages, see *Reference*).
- **OSINT:** MaxMind (IP lookup), NumLookup (phone), Google Images (reverse image search), Blockchair (blockchain explorer) and Fingerprint.
- **LEO:** Accurint, Kodex Portal and Chicago HIDTA, plus any you add.

OSINT and LEO links open the website **in a new browser tab**, outside CaseVault. CaseVault never contacts those sites itself and sends them nothing (not even which page you came from), so CaseVault stays offline: the **Offline** badge doesn't change when you click one. The website itself needs the PC's internet connection, like any site you open in the browser. Don't paste case details into outside websites unless your policy allows it.

- **Show / hide** lets you hide the buttons you don't use (click the eye on each), and bring them back.
- **Edit links** (or **Vault → Quick links**) changes a link's name or web address, and adds your own, for example your agency's portals. Chicago HIDTA has no address until you add your portal's. Changes save when you leave the box, in `vault.json` on the SSD.

## Cases

- **New case** asks for a title (required), the **file number**, the **case number**, client, status, opened date, and tags. One file number can hold several cases: the File number box offers the file numbers you already use. The case folder and file names use the case number.
- The case list and the case's header show both, for example *File F-2026-01 · Case 00123*, and the search box finds either. Templates can use `{{case.fileNumber}}` and `{{case.number}}`.
- The **left list** shows open and pending cases, most recently changed first. Use the search box (title, number, client, or tag) and the filter to find others.
- **Details** tab: edit any field. A short note under **Status** says what the status means and, for a Pending case, what you're waiting on.
- **Case actions** (at the bottom of Details) has **Close case…** (or **Reopen case**), **Add arrest details**, **Archive case…** and **Delete case…**.

### Open, Pending, Closed, Archived: which one?

CaseVault doesn't guess the status from the files; you set it, and it asks the questions that go with it.

| Status | Use it when | What CaseVault does |
|---|---|---|
| **Open** | You are actively working the case: interviews, reports, warrants to write. A new case starts here. | Nothing extra. |
| **Pending** | The next step is **someone else's**: lab results, a warrant signature, prosecutor/DA review, a subpoena or records return, a suspect not yet located, another agency, a court date. | Asks **what you're waiting on** and a **follow-up date** (two weeks by default), and can put *Follow up: …* on the timeline as a deadline, so the case comes back to you. The case list shows *⏳ Waiting on …*. Setting it back to Open clears this. |
| **Closed** | The investigation is **finished** and has an outcome (see *Close a case* below). | Asks for the disposition, date and a closing note, and lists loose ends first. |
| **Archived** | Closed and you want it **out of the way**. | Moves it to `archive\`, read-only (see *Archive a case*). |

A rule of thumb: *Is the next step mine?* → Open. *Am I waiting on someone?* → Pending. *Is it done?* → Closed. *Done and not needed day to day?* → Archived.

### Close a case

Choose **Close case…** under Case actions (or set the status to *Closed*). CaseVault asks for:

- **Disposition**: *Cleared by arrest*, *Exceptionally cleared* (with the reason: death of the offender, prosecution declined, victim refused to cooperate, extradition denied, juvenile/no custody, other), *Unfounded*, *Inactive / no further leads*, *Referred to another agency*, or *Other*. Use your agency's own definitions where they differ.
- **Closed date** (today by default) and a **closing note**.
- **Before you close** lists loose ends: open deadlines on the timeline, open consistency check flags, and `[CONFIRM: …]` left in drafts. They're reminders; they don't stop you closing.

Choosing *Cleared by arrest* opens the **Arrest details** tab so you can fill it in. **Reopen case** sets the status back to Open; the closing is kept in the case history, and the arrest details stay.

### Arrest details

The **Arrest details** tab (after Details) appears once you choose **Add arrest details** or close a case by arrest. It holds what goes on an arrest report, for one or more arrestees:

- **Arrestee**: name, date of birth, sex, race, height, weight, hair, eyes, address, phone, DL/ID number.
- **Arrest**: date, time, location, type (on-view, warrant, summons, turned self in), warrant number, arresting and assisting officers, Miranda and its time, booking number, facility, bond.
- **Charges**: statute/code, charge, level (felony, misdemeanor…), degree/class, counts. **+ Add charge** for more.
- **Property** and **notes**.

It saves on its own as you type (and with the **Save** button) to `arrest.json` in the case folder. **Start an arrest report draft** makes a new draft from your arrest report template with all of this filled in (see *Templates*). Arrestees' names are added to the names the privacy scan always hides from online AI and flags in mail.

### Archive a case

**Archive case…** moves the whole case folder from `CaseVault-Data\cases\<case>\` to `CaseVault-Data\archive\<case>\`: notes, timeline, files, drafts and checks. CaseVault copies every file, reads each copy back and compares it with the original byte for byte, and only then removes the original. If anything goes wrong on the way (the SSD is unplugged, a copy doesn't match), the case stays where it was, unchanged, and CaseVault says so. The status becomes *Archived*, and the closed date is filled in if it was empty.

- Archived cases leave the case list. They appear under **Archived (N)** at the bottom of the list; click it to fold it open. The search box searches them too.
- An archived case opens **read-only**, with an *Archived case* banner. You can read the notes and timeline, open files, read drafts and past checks, and export a copy of a draft to this computer. Nothing can be changed or added.
- **Restore to active cases** (in the banner or under Case actions) moves it back to `cases\` with the status it had before, and it can be changed again.
- If a move was interrupted halfway, CaseVault sorts it out the next time it opens the vault (or on **Vault → Rebuild case index**). A copy that was fully checked is kept. An unfinished copy is ignored, and the original stays in place.

### Delete a case

**Delete case…** permanently deletes the case from the SSD: notes, timeline, files, drafts and checks. There is no trash. To confirm, type the case number (or the title, if the case has no number). The same window offers **Archive instead**. Archived cases can be deleted too.

**Hide the case list** with the button at the top of the list (or `Ctrl + \`) to give the page more room. The list shrinks to a thin strip with **Show the case list** and **+** (new case); the same **Show** button also appears at the left of the header. On a phone-sized window the list hides completely. CaseVault remembers the choice in `vault.json`.

The **Overview** screen (click **CaseVault** at the top left) shows counts by status, the next deadline for each active case, and recently updated cases.

## Notes

The **Notes** tab is a large free-form page, saved as `notes.md` in the case folder. You can use simple formatting and check it with **Preview**:

```
# Heading
**bold**, *italic*, ++underline++, `code`
- bullet point
1. numbered point
> quoted text
---            (a divider line)
| Item | Weight |      (a table: a header row,
| --- | --- |            this line,
| Exhibit 1 | 28 g |    then one line per row)
```

The **formatting bar** above the text does this for you: **B** bold, *I* italic, U underline (or **Ctrl+B / Ctrl+I / Ctrl+U**), heading, bulleted and numbered list (on the selected lines; click again to take it off), and **table** (pick the size on the grid, then type into the cells). Ctrl+Z undoes. Drafts have the same bar, and tables and underline come through in the Word export.

Notes save on their own as you type. The **Save** button next to Preview writes them straight away, and the text beside it shows *✓ Saved 14:02* once they're on the SSD.

## Timeline

Add dated **Events** (things that happened) and **Deadlines** (things that are due), with an optional time and note.

- Entries are always sorted by date.
- Deadlines show *due today*, *in N days* (amber within a week), or *N days overdue* (red).
- Tick the checkbox on a deadline when it's done. It's crossed out and no longer counts as upcoming.
- **Edit** loads an entry back into the form. **Delete** removes it after you confirm.
- Each case's next open deadline also appears in the left list and on the Overview screen.

## Files

Every case has the same document folders, both in CaseVault and on the SSD (`cases\<case>\files\...`):

> Case Initiation · Affidavit Drafts · Affidavit Final · Warrant Drafts · Warrant Final · Warrants Signed · Arrest Report · Supplementary Report · Case Report · Deconfliction · Drug Exhibits · Other Exhibits · Email · Ops Plan · Subpoena Drafts · Subpoena Sent · Subpoena Response · Subject Information · Recordings (with **Video** and **Audio** sub-folders) · Vehicle Information · Maps · Case Closing · Other

Cases made before v1.11 keep their **Affidavits** folder: it still shows (and works) while it holds files; new files go to Affidavit Drafts or Affidavit Final.

### Arranging folders and files

- **Folders:** drag a folder up or down the list to put it where you want (or select it and press **Alt+↑ / Alt+↓**). The order is the same in every case. **Standard order** puts it back.
- **Move a file:** drag it from the table onto a folder on the left. It's renamed by that folder's convention, like **Move / rename**.
- **Sort:** click a column heading (Name, Type, Size, Added) to sort by it; click again to reverse.
- **Your own order:** in a folder, click **Custom** and drag the rows into the order you want. It's kept for that folder in the case (`file-order.json`).

The table has one row per file with clear lines: **Name** (with the folder underneath in *All documents*; a long name ends in "…", and pointing at it shows the whole name), **Type** (PDF, Word, Video (MP4)…), **Size**, **Added**, and the **Open**, **Move / rename** and **Delete** buttons.

### Naming convention

- A **new case folder** is named `<year>-<case no.>`, for example `2026-00123` for case 00123 opened in 2026 (the year comes from the **Opened** date). If that name is taken, CaseVault adds `-2`. A case created without a number gets a dated name; add the number on **Details**, then use **Rename folder to 2026-…** there. Every file is copied and checked before the old folder is removed.
- **Every file** you save is named `<year>-<case no.> <document type>`, for example `2026-00123 Arrest Report.pdf`, `2026-00123 Supplementary Report.pdf`, `2026-00123 Recording.mp3`. A second one becomes `2026-00123 Arrest Report (2).pdf`. You can add a short description: `2026-00123 Supplementary Report - Det. Doe.pdf`.
- A case number that already starts with the year (`2026-00123`) isn't doubled.

### Adding files

Pick a folder on the left and drop files onto the box (or click **choose files**). With **All documents** selected, CaseVault asks the document type for each file, with a guess from its name (for example `supp 2.pdf` → Supplementary Report, `search warrant signed.pdf` → Warrants Signed, `interview.mp3` → Recordings › Audio, `bodycam.mp4` → Recordings › Video), and shows the name it will be saved under. Files are **copied**; your originals aren't changed.

- **Open** previews PDFs, images, text, audio, and video right inside CaseVault. Excel and CSV files open as tables (see below).
- **Word files (.docx)** open inside CaseVault as a readable, read-only page: headings, bold/italic/underline, numbered and bulleted lists and tables are kept; fonts, spacing and pictures aren't. Open the file in Word for the exact layout. Old **.doc** files can't be shown: open them in Word and *Save As* .docx.
- Other types can't be previewed. CaseVault shows you where the file is on the SSD, so you can open it from File Explorer.
- **Move / rename** moves a file to another folder, or renames it by the convention (the copy is checked before the original is removed).
- A small **name** badge marks a file that doesn't follow the convention.
- **Delete** permanently removes the file from the SSD after you confirm.
- Files added with CaseVault 1.8 or earlier sit in **Unsorted**. Use **File it…** on each to put it in its folder with a conventional name.
- Drafts exported to the case (**Export → Save to case files**) are filed too: affidavits in Affidavit Drafts, subpoenas in Subpoena Drafts, summaries and DEA-6 reports in Case Report, others in Other.

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

## Ask AI

**Ask AI** in the header opens a chat, like claude.ai, with the AI **on this computer**: nothing you type leaves the PC, and it works offline.

- **Model:** every AI model installed in Ollama on W: (and the in-browser model, if that's what's running). Your choice is remembered in the vault. See *Other models* in [AI-SETUP.md](AI-SETUP.md) to add one, including a less-filtered model.
- **Case:** pick a case to ask about it. Its details, timeline and notes go with each question, and the AI is told to answer from them and say where each fact comes from. **Search the case files** also reads the case's documents and sends the passages that answer your question (slower the first time a document is read). Choose *No case* for general questions.
- Type and press **Enter** (Shift+Enter for a new line). **Stop** ends an answer early and keeps what's written. Earlier questions and answers go along, so you can ask follow-ups; the oldest drop off when the AI's window is full.
- Answers are formatted (lists, tables). The copy button copies one.
- The conversation stays in this window only. **Save to case** saves it as a draft in a case (on the SSD); **New chat** clears it.
- If a check or Draft with AI is running, the question waits for it (the AI does one thing at a time).
- AI answers can be wrong. Check anything you use against the case.

## Reference

**Reference** in the header (or the Reference tab of Quick links) opens quick-reference material from LE Cyber-Docs. It's a quick reference only: always follow your department's policies.

### Narcotic calculator

- **Value calculator:** pick the drug, type the amount and the unit (only units with a price are offered), and the street value appears. **Copy for a report** copies one line such as *Cocaine (Powder), 28 grams: approximate street value $3,500.00 (HIDTA 2022, $125.00 per gram).*
- **Street value chart:** every drug by category, per gram, pill, ounce, pound and kilogram (HIDTA 2022). **≈** marks an estimate (the gram price × 454); **verify** marks a price that needs a current figure.

### Incident location codes and Commonly used UCR

Code cards grouped by category. Search by code or words (`agg handgun`), or pick a category. **Click a code to copy it.**

(The DUI guide and the narcotic complaint forms were removed in v1.11. If you imported complaint PDFs in v1.10, they're still on the SSD in `CaseVault-Data\reference\complaints`; move the ones you want into the **Library** or delete the folder.)

## Saving

**Every change is written to the SSD automatically**, within about a second. Notes, Drafts and Arrest details also have a **Save** button if you want to be sure. The indicator at the top right shows:

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
5. Click **Run check**. A window shows each step: reading each document (scanned pages go through OCR), the rule checks, then the AI review statement by statement, with the time spent on the current statement and an estimate of the time left. **Cancel** stops the check. If the AI review was already under way, what it found so far is saved.

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

Names spelled with two letters swapped (*Sampel / Sample*) are flagged too. `00123` and `2026-00123` count as the same case number. Your own details from **My details** and today's date (a template's signature block and *Prepared …* line) are never reported as "not found in the reports".

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

Each run is saved as `CaseVault-Data\cases\<case>\checks\<date>-check.json`. A second run on the same day is saved as `<date>-2-check.json`, and so on. Past checks are listed on the Checks tab, newest first, with their counts and how many flags are still open. To remove one, open it and click **Delete this check** (you're asked first; the documents themselves aren't touched).

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

## Department mail (Mail tab)

The **Mail** tab of a case prepares an email to your department with documents from that case. CaseVault never sends mail itself and never holds a mail password: it checks the message, then hands it to Outlook, and you press **Send** there, so your department's own mail system (encryption, retention, DLP) handles it.

**One-time setup** in **Vault → Department mail**: your department's mail domain(s), for example `agency.gov` (exactly that domain) or `*.agency.gov` (it and its sub-domains); an optional address book; an optional subject marking such as `[LES]` (can be made required); the footer; and the attachment limit (20 MB by default).

**Safeguards**, checked every time:

1. **Recipients** must all be in the department's domains. Any other address is blocked, not just warned about.
2. **Attachments** come only from this case, must stay under the size limit, and a file whose name carries a different case number is flagged.
3. The **subject, message and every readable attachment** are scanned for personal details (see below). The review screen lists what was found. If it finds an SSN, date of birth, ID, card or bank number, you must type `SEND` to go ahead.
4. You tick **I have checked the recipients, the text and the attachments**.

Then:

- **Check & create Outlook draft** saves the message in the case's **Email** folder as `2026-00123 Email - <subject>.eml` and opens it in Outlook (with Start-CaseVault.bat running) as a new email with the attachments already in it. In Chrome/Edge direct mode, CaseVault shows where the file is; double-click it in File Explorer. This works with classic Outlook for Windows; the new Outlook may open it read-only, in which case attach from the Email folder by hand.
- **Check & open in mail app (text only)** hands subject and message to your default mail app with a `mailto:` link. No attachments.

Every hand-off is listed under **Mail prepared from this case** (saved in `mail-log.json` in the case folder) and in the outbound log.

- **Discard draft** clears the message you're writing (after asking, if you typed anything).
- **Delete draft** next to an Outlook draft in the list deletes its `.eml` file from the Email folder. The line stays in the list as *Draft deleted*, so the record of what was prepared is kept. Mail already sent from Outlook isn't affected.

## Online research & drafting (optional)

CaseVault is offline by default. If your agency allows it, you can ask Claude research and drafting questions, with personal details hidden first.

1. **Vault → Online features → Allow going online** (one time).
2. Click **Offline** in the header (it becomes **Online · 15 min** once you go online). CaseVault goes offline again after 15 minutes without use (changeable), whenever it starts, and when the SSD is unplugged.
3. Choose the **service**, the **purpose** (Research or Drafting) and, optionally, the **case**. With a case, its client, number and drafts are available: **Insert a draft from this case**.

**Services:**

- **claude.ai (my Claude subscription)**: a Claude Pro/Max subscription can't be connected to other apps, so CaseVault does it the safe manual way. It hides the details, copies the result, and opens claude.ai in a new tab. Paste it there, then paste Claude's answer back into CaseVault, which puts the real names back on this computer.
- **Anthropic API** (optional): answers appear inside CaseVault. Needs an API key, **billed separately** from a subscription. See *Setting up the API key* below.

**What happens to your text:** every message goes through the same review screen. Names, SSNs, dates of birth, IDs, phone numbers, emails, addresses, plates, VINs, case numbers and card/bank numbers are replaced with placeholders like `[NAME_1]` and `[PHONE_1]`. Those can't be un-ticked. Possible names found by pattern can be un-ticked (for example a court's name). **Hide this too** adds anything the scan missed. The box *Exactly what will be sent* shows the final text. The same person keeps the same placeholder for the whole conversation, and answers are shown with the real values put back (untick *Show real names* to see what Claude saw). **Save to case as draft** keeps an answer in the case's Drafts, marked AI-assisted.

Phone numbers are found with or without the area code (`555-0142`), and plates with or without the word "plate" (`TST-1284`). When details overlap, for example your own surname inside a street address or an email, the whole address or email is hidden, not just the name (v1.9.1).

Detection is a safety net, not a guarantee. Always read the text before you send it, and add names CaseVault should always hide to **Vault → Always hide**: subjects, informants, nicknames, street names.

Only `api.anthropic.com` can ever be reached (the page's security policy blocks every other address), only with text you reviewed, and each review allows one request. Case files are never sent automatically.

### Setting up the API key (optional)

The same steps are shown inside CaseVault: **Research & drafting (online)** → Service **Anthropic API** → **Add API key…** (or **Vault → Online features → Anthropic API key**). The links there open the right Console pages in a new tab.

1. **Open the Claude Console** at [platform.claude.com](https://platform.claude.com/). It is Anthropic's site for developers, separate from claude.ai. The old address, console.anthropic.com, goes to the same place.
2. **Sign in or create an account** with your email, Google or single sign-on. Your Claude Pro login works, but a Pro subscription does **not** include API credit. If your agency has an organisation account, ask its administrator to invite you instead.
3. **Add credit.** Go to **Settings → Billing**, add a payment method and buy credit (the minimum is small, about $5). Until there is credit, every request is refused.
4. **Set a spending limit** (recommended). In **Settings → Limits**, set a monthly limit and an email alert. Leave auto-reload off unless you need it.
5. **Create the key.** Go to **Settings → API keys → Create Key**. Name it after the PC, for example `CaseVault - Beelink` or `CaseVault - L14`, so you can switch one off without touching the other. Keep the Default workspace.
6. **Copy it now.** It starts with `sk-ant-api03-` and is about 100 characters long. The Console shows it **only once**. Don't paste it into email, chat, notes or a document.
7. **Add it to CaseVault.** Click **Add API key…**, paste it (Ctrl+V) and choose where to keep it:
   - **This session only**: the safest choice. The key is gone when you close CaseVault, and you paste it again next time.
   - **Save on the SSD, locked with a passphrase**: encrypted (AES-256) in `CaseVault-Data\secrets\anthropic.json`. CaseVault asks for the passphrase once per session (**Unlock…**). If you forget the passphrase, remove the key and add it again.
   - **Save on the SSD without a passphrase**: protected only by BitLocker on the CASEVAULT drive.

   Tick that you understand the billing, then click **Save key**. CaseVault checks the format and catches the usual mistakes: an incomplete copy, an Admin key (`sk-ant-admin…`), or a subscription token (`sk-ant-oat…`).
8. **Test it.** Click **Go online**, then **Test key**. CaseVault asks Anthropic for its list of models, which contains no case data. *Key works* means you're ready. *Refused* means it was mistyped or revoked.
9. **To stop using it**, click **Remove API key…**. This removes it from CaseVault and deletes it from the SSD. Then **revoke** it in the Console: **Settings → API keys**, open the key's menu, choose Delete. Revoking takes effect immediately everywhere. Do it straight away if the SSD or a PC is lost.

**Replace…** swaps in a new key (for example after revoking the old one). The key is only ever sent to `api.anthropic.com`, in the request header. It is never written to vault.json, the browser's storage or the outbound log. CaseVault forgets it from memory when the SSD is unplugged or another vault is opened.

### Outbound log

**Vault → Outbound log** lists every online AI request and mail hand-off of the last two months: when, where, why, what kinds of details were found, and how many were hidden. Never the text itself. The logs are in `CaseVault-Data\logs\outbound-YYYY-MM.json`.

## Self-test

**Vault → Maintenance → Run self-test…** checks in about a minute that CaseVault works on this PC. Run it after updating CaseVault, or on a new PC. It uses its own made-up documents, never your cases.

| Check | What it proves |
|---|---|
| SSD: write, read back, delete | The vault drive can be written (one small test file, deleted again) |
| Word, PDF, XFA form, spreadsheet readers | Documents of each kind can be read for checks |
| OCR | Scanned pages and photos can be read |
| Consistency rules on a mini case | Five planted errors (time, plate, count, amount, a misspelled name) are all flagged, and a matching address is not |
| Privacy | Every kind of personal detail is hidden before anything could go online |
| Online state | CaseVault is offline |
| AI engine and model for this PC | Which model checks use here, and why (see *Profile on this PC* in [AI-SETUP.md](AI-SETUP.md)) |
| Passage search model | Whether `nomic-embed-text` is installed |
| AI answers | A one-word test answer, with the time it took and the speed |

✓ is fine, **!** is worth a look (for example the AI engine isn't running), ✗ is a problem. **Copy report** copies the list as plain text, with no case data, for support.

## Memory indicator

The header shows memory use, for example `RAM 44% · App 180 MB · AI 5.1 GB`. Hover over it (or tab to it) for details:

- **App**: CaseVault's own memory in this tab (Chrome and Edge report it).
- **AI**: the local model Ollama has loaded, how much of it is on the graphics card and how much in RAM. The Quick profile on the Beelink should show 100% GPU; Thorough is split.
- **RAM** and **CASEVAULT drive** free space: shown when CaseVault runs through Start-CaseVault.bat (the browser can't read them on its own).

It turns amber, then red, when memory or disk space is running low. **Free AI memory** unloads the local model now instead of after 10 idle minutes. It loads again the next time it's needed.

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

With **AI suggestions** ticked in the toolbar, pausing for a moment at the end of a line shows an **AI suggestion** box just below the line you're typing on (or above it, near the bottom of the window). It shows the end of your sentence in grey, then the suggested continuation highlighted.

- **Tab** accepts it. So does clicking the highlighted suggestion.
- **Esc** (or typing something else) dismisses it. If you type the first letters of the suggestion, the rest stays.
- The cursor stays in your text the whole time; the box never takes the focus. Screen readers announce the suggestion.
- It uses the smallest AI model you have installed, so it's quick, and it only ever talks to the AI engine on this computer.
- It pauses while a consistency check or *Draft with AI* is running, so they don't compete for the graphics card.
- It switches itself off when the header shows **AI: Offline** or **AI: Rules-only**. Untick it any time; CaseVault remembers the choice.

### Draft with AI

Click **Draft with AI…** in the editor (or pick it when creating a draft) and choose:

- **Document type** (including **DEA-6 Report of Investigation**, **DEA-7 drug evidence** and **DEA-202 personal history**) and optionally a **template** to follow.
- **What to use:** the case details (always), the timeline, the notes, and any attached documents. For long documents, CaseVault picks the passages most relevant to the draft.
- **Writing behavior:** how the AI writes. **DEA-6 style** is the default (third person, SYNOPSIS, numbered DETAILS paragraphs in time order, INDEXING). Others: plain narrative report, affidavit / formal legal, brief summary, and any you make (see *AI writing behavior*).
- **Library:** the examples to write like and the directives to follow (see *The Library*). Examples of the document type you chose are ticked for you, and so are your "always use" directives.
- **Reference** (optional): the **narcotics street values** and the **incident location and UCR codes**, for values and codes.
- The AI uses the Library and Reference only for **how** to write (format, headings, tone, wording) and for rules, values and codes, **never as facts of this case**; the names and events in your examples belong to other cases and are never copied. The draft's sources list what was used.
- Optional **instructions**, such as "focus on the events of March 14".
- **Replace** the current text, or **add** below it.

The draft appears in the editor as it's written. **Stop** keeps what has been written so far. If a consistency check is running, the draft waits for it to finish first.

If every model you have is small (under 5B parameters), the dialog says so: small models are fine for suggestions but weak at whole drafts. Install `qwen2.5:7b` for better drafts (see [AI-SETUP.md](AI-SETUP.md)).

The AI is told to use **only** the case material you selected, to keep facts and numbers exactly as written in the reports, and to write `[CONFIRM: ...]` for anything missing (names, dates, badge numbers, the court) rather than invent it.

AI-written drafts always show this banner:

> ⚠ AI-generated draft. Verify every fact against the source before signing or filing.

Read an AI draft as a starting point. It can still misstate things, so check every sentence against the reports.

### The Library

**Vault → Library** holds documents the AI learns from, kept in `CaseVault-Data\library` on the SSD:

| Part | What to put there |
|---|---|
| **Report examples** | Finished reports written the way you want: DEA-6s, DEA-7s, DEA-202s, supplementary reports |
| **Warrant examples** | Search and arrest warrants and affidavits to follow |
| **Directives** | Policies and directives the AI must follow and may cite |
| **Other** | Anything else to keep at hand |

- **Add files…** or **Add a folder…** (PDF, Word, text; scanned PDFs are read with OCR the first time). Pick which part first with **Add to**.
- Each example has a **type** (DEA-6, DEA-7, DEA-202, affidavit, warrant…), guessed from its name; change it if the guess is wrong. Draft with AI picks examples of the type you're writing.
- Each directive has **Always use**: ticked directives go with every Draft with AI.
- The eye button shows the text the AI reads from the file. Move a file between parts with its list, or delete it.
- Only the AI on this computer reads the Library; it's never sent online. Long files are shortened to fit the AI's window, so short, typical samples work best (two or three good DEA-6s beat twenty).
- **Real forms with PII are fine.** Library files stay on the encrypted SSD, and only the AI on this computer (Ollama at 127.0.0.1, or the in-browser engine) reads them. They're never sent online: the online research page doesn't use the Library. The one thing to watch is the output: the AI is told never to copy names or facts from examples, but a small model can slip, so read every draft for names that belong to another case. If you'd rather not rely on that, black out or replace names in the samples first (*SUBJECT 1*, *SA EXAMPLE*); the AI learns the format just as well.

### AI writing behavior

**Vault → AI writing behavior** holds the instruction prompts that tell the AI how to write. Pick one to read or edit it, **Save behavior**, **Make default** (the one Draft with AI starts with; DEA-6 style unless you change it), **New (copy of this)** to make your own, and **Restore original** for a built-in one you've edited.

### Checking a draft

On an **Affidavit** draft, **Run consistency check** checks the draft against every document attached to the case, using the same checker as the Checks tab (rules, plus AI review when connected). Click a flag to see the sentence in the draft, and **Open draft** to go back and fix it. The draft's own exported copies are left out, so the draft is never compared with itself.

### Export

**Export ▾** in the editor offers:

- **Save .docx to case files (SSD).** A Word file is added to the case's Files tab. Recommended: it stays on the encrypted SSD.
- **Save .docx to this computer…** Chrome/Edge ask where to save it. Firefox uses its normal download. Choose a folder on the SSD if you don't want a copy on the PC.
- **Copy as plain text.** Copies the text without Markdown symbols, to paste into another program.

The Word file keeps headings, paragraphs, bold and italic, bullet and numbered lists. Any `[CONFIRM: ...]` left in the text is highlighted yellow in Word so it can't be missed.

### Templates

A template is your document format (an affidavit, an arrest report, a subpoena…) with **placeholders** where the case details go. Manage them in **Vault → Templates**. Each one is a Markdown file in `CaseVault-Data\templates\` on the SSD.

**Adding a template: three ways**

1. **Import your agency's Word form** (easiest): **Import Word, .md or .txt…** and pick the `.docx`. CaseVault turns it into text: headings, bold/italic, lists and tables are kept; fonts, logos and exact spacing aren't (the draft exports to Word with CaseVault's plain layout). Check the text in the editor, put placeholders where case details go, and **Save template**.
   *Tip:* type the placeholders in Word before you import, for example `{{case.number}}` or `«case.number»`: both come through as `{{case.number}}`.
2. **New template**: paste or type the text and add placeholders.
3. **Add generic starter templates**: an affidavit, a subpoena, a case summary and an arrest report. They're **generic examples, not legal forms**; use them as a starting point and replace them with your agency's approved formats.

There's no required layout. Plain text works; to format it, `# ` at the start of a line makes a heading (the first heading is the template's name), `**bold**`, `*italic*`, `- ` a bullet, `1. ` a numbered line. **Edit / Delete** change or remove a template. Old `.doc` files: open them in Word and *Save As* `.docx` first.

**Placeholders.** Under the editor, **Placeholders** lists every one; click one to put it at the cursor. Upper and lower case don't matter.

| Placeholder | Becomes |
|---|---|
| `{{case.title}}`, `{{case.number}}`, `{{case.client}}`, `{{case.status}}`, `{{case.tags}}` | The case's details |
| `{{case.opened}}`, `{{case.closed}}` | The case's dates |
| `{{affiant.name}}`, `{{affiant.title}}`, `{{affiant.agency}}` | Your details from **Vault → My details** |
| `{{affiant.address}}` | Your address, on as many lines as you typed |
| `{{affiant.phone}}`, `{{affiant.email}}` | Your phone number and email |
| `{{today}}` / `{{today.iso}}` | Today, as *September 28, 2026* / *2026-09-28* |
| `{{arrest.name}}`, `{{arrest.dob}}`, `{{arrest.description}}` | The first arrestee from **Arrest details**: full name, date of birth (MM/DD/YYYY), and "sex, race, height, weight, hair, eyes" |
| `{{arrest.charges}}` | The charges, one numbered line each: *1. statute — charge (level, degree; 2 counts)* |
| `{{arrest.date}}`, `{{arrest.time}}`, `{{arrest.location}}`, `{{arrest.bookingNumber}}`, `{{arrest.facility}}`, `{{arrest.miranda}}`… | Any arrest detail by its name (the editor's list has them all) |
| `{{arrest.2.name}}`, `{{arrest.2.charges}}`… | The second arrestee (and so on); `{{arrest.names}}` lists them all |
| `{{closure.disposition}}`, `{{closure.reason}}`, `{{closure.date}}`, `{{closure.note}}` | How the case was closed |
| `{{confirm: badge number}}` | `[CONFIRM: badge number]` |

A placeholder with no value (for example a case without a client) becomes `[CONFIRM: case.client]`, so nothing missing slips through.

**My details.** Fill in your name, title, agency, address, phone and email once in **Vault → My details**. Changes save to `vault.json` on the SSD as soon as you leave a box. They're used for new drafts from then on. Drafts you already made keep their text. Leave a box empty and templates show `[CONFIRM: affiant.phone]` (and so on) instead. The starter affidavit uses these placeholders; starter templates added before v1.8 don't, so add them to your own copy if you like.

## Backups

- The first time you connect each day, CaseVault copies `vault.json` (the case list and settings) to `CaseVault-Data\backups\vault-YYYY-MM-DD.json`. It keeps the newest 30. You can change that under **Vault** at the top right, and **Back up now** makes an extra copy.
- Those backups cover the *index*, not the cases themselves. To protect your cases, **regularly copy the whole `V:\CaseVault-Data` folder** to a second BitLocker-encrypted drive stored somewhere else.
- If `vault.json` is ever damaged, restore it from a backup: copy the newest `backups\vault-….json` over `CaseVault-Data\vault.json`. Then click **Vault → Rebuild case index**. CaseVault always rebuilds the list from the case folders when it opens, so the case list repairs itself.

## What is stored where

| Where | What |
|---|---|
| **SSD, `V:\CaseVault-Data\`** | All case data: details, notes, timelines, files (in their document folders), drafts, consistency checks and the text read from documents, mail logs, templates, the **Library** for the AI (`library\`), settings (including the AI writing behaviors and Quick links, (including the privacy-screen PIN hash, **My details**, mail settings and the PII watch list), backups, the outbound log (`logs\`) and, only if you ask, the online AI key (`secrets\`). Active cases are in `cases\<case>\`, archived cases in `archive\<case>\` (same contents). |
| **SSD, `W:\`** | The launcher, the helper, the AI engine and its models. No case data. |
| **The browser on this PC** | The CaseVault app files (so it opens offline), in Chrome/Edge a *pointer* to the vault folder so it can offer **Reconnect**, and two display preferences (the theme and the AI profile). No case data. |
| **GitHub** | Only the app's code. Case data can never be committed; the repository blocks it. |
| **The internet** | Nothing, unless you go online. Normally CaseVault only talks to the AI engine (and, in Firefox, the helper) on this same computer, at `127.0.0.1`. When you go online for research or drafting, reviewed and redacted text goes to `api.anthropic.com` (API), or you paste it into claude.ai yourself. Department mail is sent by Outlook, not by CaseVault. |

To make a PC forget the vault folder, open **Vault → Disconnect**.

## Updating CaseVault

- **Installed app:** updates download automatically the next time you open it online. You'll see *"A CaseVault update was installed"*. Reload when convenient.
- **SSD copy (also what the Firefox helper serves):** download the ZIP again and replace the files in `V:\CaseVault-App\`. Your data in `CaseVault-Data` is separate and isn't affected. Also copy the new `tools\` files to W: (see [AI-SETUP.md](AI-SETUP.md)).

## Troubleshooting

| Problem | What to do |
|---|---|
| *In this browser, CaseVault runs through the CaseVault helper* | You're in Firefox. Start `W:\Start-CaseVault.bat`, which opens `http://127.0.0.1:8517/`. |
| *The CaseVault helper is not running* | Start `W:\Start-CaseVault.bat` and click **Reconnect**. |
| Checks are very slow on the laptop | The laptop runs AI on its processor. Click **AI:** and choose **Light** for this PC (or keep **Auto**: it switches to Light by itself after the first request). The choice is kept per PC. |
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
