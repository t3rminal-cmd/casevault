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

- **Open** previews PDFs, images, text, audio, and video right inside CaseVault.
- Other types (Word, Excel, and so on) can't be previewed. CaseVault shows you where the file is on the SSD, for example `CaseVault-Data\cases\20260928-ab12cd\files\statement.docx`, so you can open it from File Explorer.
- **Delete** permanently removes the file from the SSD after you confirm.

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

1. Attach the affidavit and the reports on the **Files** tab. PDF (including scanned PDFs), DOCX, TXT, and photos (PNG/JPG) can be checked. Old `.doc` files must be saved as `.docx` or PDF first.
2. Open **Checks**. Under **Document to check**, pick the affidavit. (Choose *none* to only compare the reports with each other.)
3. Tick the reports to compare against. All of them are ticked by default.
4. **Include AI review** is available when the header shows **AI: Connected**. Without it, the rule-based checks still run.
5. Click **Run check**. A window shows each step: reading each document (scanned pages go through OCR), the rule checks, then the AI review statement by statement. **Cancel** stops the check. If the AI review was already under way, what it found so far is saved.

The text read from each document is kept on the SSD (`checks\text-cache`), so re-running a check is quick. OCR only runs again if the file changes.

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

## Backups

- The first time you connect each day, CaseVault copies `vault.json` (the case list and settings) to `CaseVault-Data\backups\vault-YYYY-MM-DD.json`. It keeps the newest 30. You can change that under **Vault** at the top right, and **Back up now** makes an extra copy.
- Those backups cover the *index*, not the cases themselves. To protect your cases, **regularly copy the whole `V:\CaseVault-Data` folder** to a second BitLocker-encrypted drive stored somewhere else.
- If `vault.json` is ever damaged, restore it from a backup: copy the newest `backups\vault-….json` over `CaseVault-Data\vault.json`. Then click **Vault → Rebuild case index**. CaseVault always rebuilds the list from the case folders when it opens, so the case list repairs itself.

## What is stored where

| Where | What |
|---|---|
| **SSD, `V:\CaseVault-Data\`** | All case data: details, notes, timelines, files, consistency checks and the text read from documents, backups. |
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
| A check says a file was *Skipped* | It couldn't be read (damaged, password-protected, or an unsupported type). Save it as PDF or DOCX and attach it again. |
| *Drive not connected* | Plug in the SSD, unlock V: with the BitLocker password, then click **Reconnect**. |
| Reconnect keeps failing | The drive letter probably changed. Click **Choose folder…** and pick `CaseVault-Data` (or the drive's root). |
| *No vault found in "…"* | You picked a folder that isn't the vault. Choose the CASEVAULT drive or `CaseVault-Data`. Only click **Create vault here** for a brand-new vault. |
| *This vault was saved by a newer version* | Update the app (reload the installed app while online, or refresh the SSD copy). |
| A case disappeared from the list | Click **Vault → Rebuild case index**. If its folder is still in `cases\`, it comes back. |
| *Not saved — reconnect SSD* | See **Saving** above. Keep the window open, reconnect, and wait for green. |
