# Using CaseVault

CaseVault keeps your case files — details, notes, a timeline of events and deadlines, and attached documents — **on your SSD only**. The app runs in Chrome or Edge, works without internet, and never uploads anything.

If the SSD isn't set up yet, start with [SSD-SETUP.md](SSD-SETUP.md).

---

## Opening CaseVault

Use **Google Chrome** or **Microsoft Edge** on a desktop PC. Other browsers can't open folders on a drive, so CaseVault will tell you to switch.

You have two ways to open it. Both use the same data on the SSD.

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

## First time: create your vault

1. Plug in the SSD and unlock **V:** with your BitLocker password.
2. Open CaseVault and click **Choose folder…**.
3. Select the **CASEVAULT (V:)** drive itself and click **Select Folder**. When the browser asks, allow CaseVault to **view and edit files**.
4. CaseVault says *No vault found*. Click **Create vault here**. It creates `V:\CaseVault-Data\` with `vault.json`, `cases\`, and `backups\` inside.

## Every day

1. Plug in the SSD and unlock V:.
2. Open CaseVault. Click **Reconnect**, then **Allow** (or *Allow on every visit*, if offered).

   Browsers ask for this permission once per session. It's what stops any other website from ever touching your drive.
3. Work normally. When you're done, wait for **✓ Saved to SSD**, close CaseVault, and **safely eject** the SSD.

If the SSD isn't plugged in, you'll see **"Drive not connected. Plug in your SSD and click Reconnect."** Plug it in, unlock it, and click **Reconnect**.

If Windows gave the drive a different letter and Reconnect can't find it, click **Choose folder…** and pick `CaseVault-Data` on the SSD once.

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

## Backups

- The first time you connect each day, CaseVault copies `vault.json` (the case list and settings) to `CaseVault-Data\backups\vault-YYYY-MM-DD.json`. It keeps the newest 30. You can change that under **Vault** at the top right, and **Back up now** makes an extra copy.
- Those backups cover the *index*, not the cases themselves. To protect your cases, **regularly copy the whole `V:\CaseVault-Data` folder** to a second BitLocker-encrypted drive stored somewhere else.
- If `vault.json` is ever damaged, restore it from a backup: copy the newest `backups\vault-….json` over `CaseVault-Data\vault.json`. Then click **Vault → Rebuild case index**. CaseVault always rebuilds the list from the case folders when it opens, so the case list repairs itself.

## What is stored where

| Where | What |
|---|---|
| **SSD, `V:\CaseVault-Data\`** | All case data: details, notes, timelines, files, backups. |
| **The browser on this PC** | The CaseVault app files (so it opens offline), and a *pointer* to the vault folder so it can offer **Reconnect**. No case data. |
| **GitHub** | Only the app's code. Case data can never be committed; the repository blocks it. |
| **The internet** | Nothing. CaseVault makes no network requests except, from v1.5, to the AI engine on this same computer (`localhost`). |

To make a PC forget the vault folder, open **Vault → Disconnect**.

## Updating CaseVault

- **Installed app:** updates download automatically the next time you open it online. You'll see *"A CaseVault update was installed"*. Reload when convenient.
- **SSD copy:** download the ZIP again and replace the files in `V:\CaseVault-App\`. Your data in `CaseVault-Data` is separate and isn't affected.

## Troubleshooting

| Problem | What to do |
|---|---|
| *This browser can't open folders on your SSD* | Use Chrome or Edge on a desktop PC. |
| *Drive not connected* | Plug in the SSD, unlock V: with the BitLocker password, then click **Reconnect**. |
| Reconnect keeps failing | The drive letter probably changed. Click **Choose folder…** and pick `CaseVault-Data` (or the drive's root). |
| *No vault found in "…"* | You picked a folder that isn't the vault. Choose the CASEVAULT drive or `CaseVault-Data`. Only click **Create vault here** for a brand-new vault. |
| *This vault was saved by a newer version* | Update the app (reload the installed app while online, or refresh the SSD copy). |
| A case disappeared from the list | Click **Vault → Rebuild case index**. If its folder is still in `cases\`, it comes back. |
| *Not saved — reconnect SSD* | See **Saving** above. Keep the window open, reconnect, and wait for green. |

## Coming in v1.5

**Offline Consistency Checker.** It compares an affidavit draft against the reports attached to a case (and the reports against each other), flagging mismatched dates, times, names, numbers, plates, and amounts. It can also run a local AI review that must quote the exact source sentence for every flag. All of it runs on your own PC. See [AI-SETUP.md](AI-SETUP.md) to prepare.
