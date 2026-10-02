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

Every screen uses one font, **Consolas** (v1.33; it comes with Windows, so nothing is downloaded).

The header has three parts:

- **Left:** the CaseVault logo and, under it, where your data is being saved (for example `W:\CaseVault-Data` in Firefox, or `CaseVault-Data` in Chrome and Edge, which don't tell CaseVault the drive letter). Click it for the Overview.
- **Middle:** status icons. Point at one for the details.
  - **Shield or globe:** green shield means offline (nothing leaves the computer). A red globe means online AI is on, and CaseVault may send reviewed text to the internet. Click it for online research.
  - **Robot:** the AI engine. Blue means it's running, and pointing at it shows the model, for example *AI: Quick · Qwen2.5:7b* (model names are shown with a capital first letter everywhere). Red means it isn't running. Click it for AI settings.
  - Moving bars show while the AI is working, and a **memory** icon turns amber or red when memory runs short.
  - **Drive:** green means everything is saved to the SSD, amber means saving, and red with words means something isn't saved (reconnect the SSD).
- **Right:** two square buttons: **Hide** (the crossed-out eye, privacy screen) and the **menu** (⋮, three dots). Point at one for its name. **Ask AI** and **Notes** are the two square blue buttons at the bottom right of every screen. The menu holds (names on the left, icons in one column on the right). **Reference**, **Library** and **Vault** are on the Overview's banner instead:
  - **Theme**, which switches between automatic, light and dark each time you click it (the menu stays open while you choose);
  - **Options** and **Contact Dev** (see below).

- Every box that opens over the page (the Vault, Options, New case, a file preview…) has an **X** at the top right to close it without changing anything, like Esc.
- The case tabs are, in order: **Details**, **Timeline**, **Reports**, **Files**, **Mail**, **Checks** (with **Arrest details** after Details once you add them).
- **Theme:** *automatic* follows Windows' light or dark setting. Each PC remembers its own choice in the browser; it's a display preference, not case data.
- Icons mark every tab, button and document folder, and each file in a case shows an icon for its type (PDF, Word, Excel, picture, audio, video, email).
- **Point at a button** (or reach it with Tab) to see what it does in a hover box. Buttons show just an icon and a short name; the explanation is in the hover box.
- Labels have no brackets, and the longer explanations aren't printed on the page: point at the heading or label they belong to (or its icon, or Tab to it) and they show in a hover box. There are no ⓘ buttons. In the Vault, pointing at a section's heading shows what that section is for, and pointing at a box in **My Profile** shows which `{{affiant.…}}` placeholder it fills.
- **Opening a file** (the eye button) shows it in a window that fills almost the whole screen, so wide Word tables, spreadsheets and PDFs aren't cut off.
- **Ask AI** (bottom right, next to Notes) opens a floating chat with the AI on this computer that stays open while you work (see *Ask AI*).
- The page is centred and uses the width of the screen, from a phone up to 1920×1080 and larger. Case actions are same-size buttons in one row.
- The **Overview** shows your case counts, then, each under a line: **Operations** (a blue folder for each), the open operation's **Timeline**, **Upcoming deadlines**, **Recently updated** (with **Clear**, which empties the list until a case changes again), and **Quick links** (see below).
- On a narrow window the header buttons shrink to their icons.
- **Hide the case list** is the button at the top of the list (or Ctrl+\\). The list shrinks to a thin strip with the same button to bring it back. On a phone-width window the list hides completely and the button moves to the header.
- **Vault** opens the settings. The list on its left (This vault, Backups, Privacy screen, My Profile, Templates, Library, AI writing behavior, Quick links, Online features, Always hide, Department mail, Outbound log, Maintenance) jumps to each section, and follows along as you scroll. **Done** is at the top right.

### Quick links

At the bottom of the Overview, in three tabs:

- **Reference:** Location Codes, Common UCR, **Charges** and the Narcotic Calculator (CaseVault's own pages, see *Reference*), and **Find my Beat** (the Chicago Police district and beat for an address; opens in a new browser tab). **Charges** asks **Federal Statute** or **State Statute** and opens that set; the Charges page can switch between State, Federal and Both.
- **OSINT:** MaxMind IP (where an IP address is), Fingerprint (browser and device fingerprint), NumLookup (free reverse phone lookup), Blockchair, Mempool and Chainalysis (crypto addresses and transactions), TinEye, Google, Google Maps and Google Images (search, maps and reverse image search).
- **LEO:** Accurint, Kodex Portal, Chicago HIDTA, **Snapchat LE Portal** (Snap's Law Enforcement Service Portal), **Meta LE Portal** (Meta's Law Enforcement Online Request System for Facebook, Instagram and WhatsApp) and Chicago Police Directives, plus any you add. Both portals need your agency account.

OSINT and LEO links open the website **in a new browser tab**, outside CaseVault. CaseVault never contacts those sites itself and sends them nothing (not even which page you came from), so CaseVault stays offline: the **Offline** badge doesn't change when you click one. The website itself needs the PC's internet connection, like any site you open in the browser. Don't paste case details into outside websites unless your policy allows it.

- **Arrange** lets you put the buttons in your own order (the ‹ › arrows on each, or drag one onto another) and hide the ones you don't use (the eye on each). **Done** finishes. The order is kept in `vault.json` on the SSD.
- Quick links sit in a slim strip at the bottom of the Overview: small buttons in rows, so they take little room.
- **Vault → Quick links** (which also has a **Save changes** button) changes a link's name or web address, and adds your own, for example your agency's portals. Chicago HIDTA has no address until you add your portal's. Changes save when you leave the box, in `vault.json` on the SSD.

## The Overview

With no case open, CaseVault shows the **Overview**: a welcome banner with the date and time, how many cases are open, whether a deadline is due soon (and the next one, one click away), and buttons for **New Case**, **Ask AI**, **Reference**, **Library** and the **Vault**. Below it are the case counts, your operations, upcoming deadlines, recently updated cases and the quick links.

**Operations:** every Operation is a blue folder with its **Operation Number - Operation Name** under it (a number on the folder shows how many cases it holds; a red bell, a deadline due), in Operation Number order, and **All Operations** opens the Operations page. Below it, **General Files** (amber folders, v1.47) holds the cases that aren't in an Operation, a folder for each year they were opened, newest first; **All Cases** opens the General Files page. Click a folder to open it: each case number in it is a card with its status and, in a row, **Reports**, **Photos** (every picture in the case) and **Files** (click the case number for its Details). The operation's **Timeline** (every case number's events, each marked with its case number) opens in its own section above Upcoming Deadlines, drawn as a line you scroll sideways (v1.33): each event or deadline is a dot with its date above and a card below, a red **Today** marker shows where you are, and clicking any of them opens the Timeline tab. **Add Case Number** creates a new case linked to the Operation (in General Files, **New Case**). Click the folder again to close it.

## Operations and General Files

From v1.46 an **Operation** is its own record, and cases are linked to it.

- **General Files** holds every case, whether it's in an Operation or not. It's the master list: open it from the Overview, from a case's header, or by clicking **General Files** in the case list. Each row shows the **Case Number**, **Subject Name**, **Operation**, status and opened date, with **Move File** (v1.50). Search by case number, subject or Operation, and show all cases, independent ones, ones in an Operation, or archived ones.
- **An Operation** has an **Operation Number** (required, no two the same), an **Operation Name** (required), a **Status** (Open, Pending or Closed), a **Start Date**, an **End Date** and **Notes**. It shows everywhere as **Operation Number - Operation Name**. **Operations** (from the Overview or General Files) lists them all; **New Operation** makes one (the next free number, OP-001, OP-002…, is filled in for you).
- **An Operation's page** shows its fields (**Edit Operation** changes them; renaming it renames it on every case) and its **Files**: the cases linked to it, each with **Details**, **Reports** and **Files**, and **Move File**. **New Case in this Operation** creates a case in General Files and links it; **Add Existing Case** links cases from General Files (a case already in another Operation is shown greyed out: move it with **Move File** instead).
- **A case is in no Operation or in one.** Nothing is ever copied: the Operation's Files are only a view of the cases linked to it. On a case's **Details** tab, the bar at the top shows the Operation it's in (or *General Files: not in an Operation*), with **Move File**.
- **Move File** (v1.50; it replaced *Assign to…* and *Unlink*) opens a box listing **General Files (independent case)** and every Operation. Pick one and press **Move**: a case in General Files goes into an Operation, a case in an Operation goes to another one or back to General Files as an independent case. The case and all its files stay where they are on the SSD; only where it's listed changes.
- **Delete Operation** (on the Operation's page) asks: *Are you sure you want to delete this Operation? The Operation and its Files folder will be removed. All associated cases and files will be preserved and will remain available in General Files as independent cases.* Only the Operation goes; every case (archived ones too) and every file stays.
- **Case Number** and **Subject Name**: every case has a Case Number (shown large) with the Subject Name under it. No two cases can have the same Case Number (archived cases count): New Case and the Details tab refuse a number that's taken. Several cases can have the same subject: New Case asks *This subject already has another case. Is this a new case number for the same subject?* (**Continue and create new case** or **Cancel**), and points out a **Possible match** when a subject's name is close to another one (one or two letters apart, or the same words in another order). Nothing is ever merged.
- **Opening a vault made before v1.46** (once, by itself): vault.json is backed up first (Vault → Backups), then cases that share a Title become an Operation named after it (its number is the cases' File Number, or OP-001 and so on), and a case with a Title of its own stays independent in General Files. Each case's Subject Name is taken from its first suspect (blank shows *No subject yet*). Case Numbers already used twice are flagged in General Files (*Duplicate*) and on the Details tab, never changed.
- **Templates:** `{{case.subject}}`, `{{operation.number}}` and `{{operation.name}}`; `{{case.title}}` is the Operation's name, or the subject for a case in no Operation.

## Cases

- **New Case** is on the Overview's banner (and the **+** on the folded case list). It asks for the **Case Number** and the **Subject Name** (both required), and the **Operation** (optional: *None (General Files)* or one of your Operations; its file number, federal jacket number and client fill in, and the line under it lists the case numbers it already has). Then the **file number**, the **Federal Jacket Number**, the client (**State**, **Federal** or **Other**), status and opened date. A client typed in before v1.14 is kept as its own choice in the list. One file number can hold several cases: the File number box offers the file numbers you already use. The case folder and file names use the case number.
- The case list and the case's header show both, for example *File F-2026-01 · Case 00123*, and the search box finds either. Templates can use `{{case.fileNumber}}` and `{{case.number}}`.
- **Operations in the case list:** every Operation is a blue folder (**Operation Number - Operation Name**, its status and how many cases), in Operation Number order, then **General Files** with the cases that aren't in one. Under each, every case shows its **Case Number** with the **Subject Name** under it. Click a folder's name to open the Operation's page (or General Files); the arrow folds it, and CaseVault remembers which are folded. On a case's **Details** tab, at the top, are the Operation bar, the **Subject Name**, **Status**, **Opened** and **Closed** dates, and, for a case in an Operation, a folder tile for each of its case numbers (click one to open it). **Add Case Number** opens New case with the Operation filled in.
- **LEO Partners** (on the Details tab): click the badges of the agencies working the case with you: federal first (DEA, FBI, ATF, USMS (U.S. Marshals), IRS, CBP, HSI, ICE, USSS (Secret Service), USPIS), then State PD, Local PD (a six-pointed star) and Sheriff (a shield), then Other. A chosen badge takes its agency's color, and the others dim (v1.36) so the chosen ones stand out; point at a dimmed one to see it clearly. **State PD**, **Local PD** and **Sheriff Dept** ask which department, **Other** asks which agency (several: separate them with a semicolon); the pencil changes it. Templates can use `{{case.partners}}` (for example *DEA, USPIS, Local PD (Example Police Department)*), and Ask AI and Draft with AI get them with the case.
- The **left list** shows every case as a card: open and pending first, most recently changed first, then closed ones. Each case shows its status in words (**Open**, **Pending**, **Closed** or **Archived**) and its title, with just the numbers under it: file number | case number | client, for example `100 | JH123456 | State`. A **red bell** right after the title (or the operation's name, for an operation's case numbers) means the case has an open deadline on its Timeline (it gently rings when the deadline is overdue or due within a week). The selected case is shown in grey. Point at a case to see the deadline, and for a Pending case what it's waiting on. Use the search box (title, any of the numbers, client, status or tag) to find one.
- **Make the list wider or narrower:** drag its right edge (or click the edge and use ← →). Double-click the edge to reset it. Each PC remembers its own width.
- **Case Overview** (the bottom half of the Details tab, under a line): **Suspects**, **Contacts** and **Deconfliction**. They belong to the whole operation: every case number of the operation shows the same lists, and a change in one case is saved to the others. (Cases made before v1.27 each had their own lists; they are joined the first time you open one.)
- **Details** tab: edit any field. A short note under **Status** says what the status means and, for a Pending case, what you're waiting on.
- **Case-number folders and timeline** (top of the Details tab, v1.37): click a case number's folder to open that case's **Reports** tab. Under the folders, a slim timeline shows every event of the operation as a small dot on a line (deadlines are diamonds, red when overdue; a red line marks today). Point at a dot for its date, title, case number and note; click it to open the Timeline tab.
- **Sidebar folding** (v1.37): click an operation's title to fold it so only the title shows (the arrow on the right turns). **Titles only**, the button next to the search box, folds every operation at once and unfolds them again. Folding is remembered in the vault on the SSD.
- **Suspects** (on the Details tab): **Add suspect** for each person the case is about (each one is a darker box, so you see at a glance how many there are): name, date of birth (the **age** is worked out for you), residence, and role (**Primary**, **Secondary** or **Other**; *Main* before v1.36), and under them (v1.34) gender, race, complexion, height, weight, hair and eye color, and tattoos / scars. **Add From Suspects** on the Draft tab copies them into the report's Offenders. The first one is Primary, later ones Secondary. They save with the case, go to **Ask AI** and **Draft with AI** with the case, and templates can use `{{suspect.name}}`, `{{suspect.dob}}`, `{{suspect.age}}`, `{{suspect.residence}}` and `{{suspect.role}}` (the primary suspect) and `{{suspects}}` (all of them, one per line).
- **Save changes** at the bottom of the Details tab saves the case to the SSD now and confirms it. Changes also save by themselves a moment after you type.
- **Deconfliction** (on the Details tab, under Contacts): a card for each deconfliction check (v1.33; the boxes wrap so nothing is cut off): date, event or location, the system checked, picked from a list (RISSafe, HIDTA Deconfliction, DICE, Case Explorer, SAFETNet, Department Deconfliction, or **Other**, which asks for its name), the deconfliction number, **Conflict** Yes / No (a Yes shows in red) and notes. **Add Deconfliction** adds a card; the bin deletes one.
- **Contacts** (on the Details tab, under Suspects): the **Case Officer**, the **prosecutor** (choose **ASA** or **AUSA**), each with name, email and phone, and **Add contact** for anyone else on the case: the Team Supervisor, a Team Member, Finance, Asset Forfeiture and so on (pick a role from the list or type your own). The bin button removes one. They save with the case on the SSD, go to **Ask AI** with the case, and templates can use `{{case.officer.name}}`, `{{case.prosecutor.title}}`, `{{case.prosecutor.email}}` and so on.
- **Case actions** (at the bottom of Details) has **Close Case** (or **Reopen case**), **Close Operation** (when the operation has more than one open case number), **Add arrest details** (or **Delete Arrest**), **Archive Case** and **Delete case…**.

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

Choose **Close Case** under Case actions (or set the status to *Closed*). CaseVault asks for:

- **Disposition**: *Cleared by arrest*, *Exceptionally cleared* (with the reason: death of the offender, prosecution declined, victim refused to cooperate, extradition denied, juvenile/no custody, other), *Unfounded*, *Inactive / no further leads*, *Referred to another agency*, or *Other*. Use your agency's own definitions where they differ.
- **Closed date** (today by default) and a **closing note**.
- **Before you close** lists loose ends: open deadlines on the timeline, open consistency check flags, and `[CONFIRM: …]` left in drafts. They're reminders; they don't stop you closing.

**Close Operation** closes every open case number of the operation at once, with the same disposition, date and note; to close only one case number, open it and use **Close Case**.

Choosing *Cleared by arrest* opens the **Arrest details** tab so you can fill it in. **Reopen case** sets the status back to Open; the closing is kept in the case history, and the arrest details stay.

### Arrest details

The **Arrest details** tab (after Details) appears once you choose **Add arrest details** or close a case by arrest. Since v1.30 it is laid out like an arrest report, one per arrestee, in the report's order:

- **Report Numbers:** CB #, IR #, YD #, RD # (the case number, unless you type another) and Event #.
- **Offender:** name, residence and beat, date of birth (the **age** is worked out at the arrest date), place of birth, driver's licence number, armed with, SSN, phone, sex, race, height, weight, eyes, hair, hair style and complexion. **Photo:** pick a picture from the case files, or **Add Photo** (it's saved in the case's Subject Information folder); it goes beside the Offender section on the report.
- **Incident:** arrest date and time, location and beat, holding facility, type of arrest, resisted arrest, declared CMA incident, TRR completed, total number arrested, co-arrests, associated cases, DCFS ward, dependent children, Miranda and its time.
- **Charges:** offense as cited (statute), charge, class, type (felony, misdemeanor…), counts and victim. Typing in the statute or charge suggests the charges on the case's Supplementary Report first, then the Illinois and federal statutes from Reference → Charges; picking one fills both. **Use Report Charges** adds the report's charges. **+ Add Charge** for more.
- **Recovered Narcotics**, **Warrant** and **Victim and Complainant:** add an entry for each (narcotic, amount, inventory number; warrant number, type, issued by, date, offense; role, name, residence, employer, phone, sex, race, date of birth, injured, deceased, hospitalized, treated and released, comments). Left empty, the report says *No narcotics recovered* and *No warrant identified*.
- **Arrestee Vehicle:** year, make, model, body style, color, VIN, licence plate and state, impounded, pound number, inventory number, disposition.
- **Properties** (confiscated property and inventory numbers) and the **Incident Narrative** (the facts for probable cause and the charges).
- **Court and Bond:** desired and initial court dates and branches, court sergeant handle, docket number; bond date and time, type, receipt number and amount.
- **Reporting Personnel:** the attesting officer, the first and second arresting officers (star numbers and beats), assisting officers, and the approving supervisor, with dates and times.

**Print / PDF** opens the **Arrest Report** as a PDF, in the same style as the Supplementary Report (grey section bands, boxed fields, page numbers, the agency from My Profile at the top, no agency's name or form number built in). Each arrestee gets their own report, starting on a new page. **Save PDF to Case** keeps it in the case's **Arrest Report** folder, and **Email for E-Sign** saves it and starts an email with it attached: the attesting officer's and supervisor's signature boxes are real signature fields (Adobe Acrobat or Reader: Fill & Sign).

It saves on its own as you type (and with the **Save** button) to `arrest.json` in the case folder; arrest details entered before v1.30 open in the new layout (a warrant number becomes a Warrant entry, the notes become the Incident Narrative). **Start an arrest report draft** makes a new draft from your arrest report template with all of this filled in (see *Templates*); `{{arrest.narrative}}`, `{{arrest.age}}`, `{{arrest.vehicle}}`, `{{arrest.narcotics}}` and `{{arrest.warrants}}` are new. Arrestees' names are added to the names the privacy scan always hides from online AI and flags in mail.

**Delete Arrest** (on the Arrest details tab, or under Case actions) deletes the arrest details after you confirm and takes the tab off, also for a case closed *Cleared by arrest*. Arrest report drafts already made are kept. **Remove Arrestee** removes one person and their charges.

### Archive a case

**Archive Case** moves the whole case folder from `CaseVault-Data\cases\<case>\` to `CaseVault-Data\archive\<case>\`: notes, timeline, files, drafts and checks. CaseVault copies every file, reads each copy back and compares it with the original byte for byte, and only then removes the original. If anything goes wrong on the way (the SSD is unplugged, a copy doesn't match), the case stays where it was, unchanged, and CaseVault says so. The status becomes *Archived*, and the closed date is filled in if it was empty.

- Archived cases leave the case list. They appear under **Archived (N)** at the bottom of the list; click it to fold it open. The search box searches them too.
- An archived case opens **read-only**, with an *Archived case* banner. You can read the notes and timeline, open files, read drafts and past checks, and export a copy of a draft to this computer. Nothing can be changed or added.
- **Restore to active cases** (in the banner or under Case actions) moves it back to `cases\` with the status it had before, and it can be changed again.
- If a move was interrupted halfway, CaseVault sorts it out the next time it opens the vault (or on **Vault → Rebuild case index**). A copy that was fully checked is kept. An unfinished copy is ignored, and the original stays in place.

### Delete a case

**Delete case…** permanently deletes the case from the SSD: notes, timeline, files, drafts and checks. Its line in the older copies of `vault.json` (`backups\`) and the Ask AI chats about it are removed too. There is no trash. To confirm, type the case number (or the title, if the case has no number). The same window offers **Archive instead**. Archived cases can be deleted too.

**The top of the case list** (v1.50): the hide-the-list button, **Search** (click it for the search box), **Home** (the Overview) and **Hide** (the privacy screen), with the padlock on the right. The folders start folded: the one holding what's on screen is open, and one you open with its arrow stays open until you go to another page. **Closed** (closed Operations and closed cases, including a closed case of an Operation that is still open) and **Archived** are grey folders at the bottom.

**Hide the case list** with the button at the top of the list (or `Ctrl + \`) to give the page more room. The list shrinks to a thin strip with **Show the case list** and **+** (new case); the same **Show** button also appears at the left of the header. On a phone-sized window the list hides completely. CaseVault remembers the choice in `vault.json`.

**Resize** the case list by dragging its right edge (double-click the edge to go back to the normal width). **Lock** it with the padlock next to the hide button: the list then stays exactly as it is, shown or hidden and at its width, and can't be hidden, resized or toggled with `Ctrl + \` until you click the padlock again. The width and the lock are kept in `vault.json` on the SSD, so they stay the same in Edge and Firefox and on another PC.

The **Overview** screen (click **CaseVault** at the top left) shows counts by status, the next deadline for each active case, and recently updated cases.

### What's new in v1.55

- **Discovery receipt.** In **Files → Discovery**, the **Options** box has **Make a receipt to sign (PDF to Downloads)**, on by default. When the package is made, CaseVault also makes the **Discovery Receipt** PDF:
  - It shows the case, date produced, Bates range, package, number of files and size, storage medium, **Turned Over By** (your name and title from My Profile) and **Turned Over To**.
  - **Date of Receipt** and **Time of Receipt** are blank boxes, filled in by hand at the hand-off.
  - Every item is listed with its Bates numbers, pages and SHA-256 fingerprint.
  - An **Acknowledgment of Receipt** says the recipient received the items and that they are accurate and complete as listed.
  - Signature lines (sign in ink) for the **Recipient**, the **Officer** and a **Witness**, each with printed name and date/time.
  - The PDF is saved to **this computer's Downloads folder** (the browser's download), ready to print. That copy is on the PC, not the SSD: once it is printed and signed, delete it from Downloads. A copy is also kept with the case (Files → Discovery → Earlier productions → **Receipt**). The Done box has **Download Receipt** and **Print Receipt**. Productions made before v1.55 get a receipt the first time you click Receipt.
  - The agency name comes from My Profile; there is no seal or form number.
- **Discovery popups** have a new look: an icon header, the options grouped in three boxes (Recipient And Bates, Where And Password, Options), and summary tiles (files, size, Bates, produced to) in **Ready to Copy** and **Discovery Package Ready**.
- **Closed folder and Operations.** A closed case whose Operation is still going used to show under the Operation's name in Closed, which looked like the Operation was closed. Now these cases are listed by case number under one folder, **Operation Files**, in Closed ("N closed cases of ongoing Operations"). When the Operation itself is closed, it moves to Closed with its name as before.

### What's new in v1.54

- **Draft tab, Officer's Report:**
  - **Court Branch and Court Officer** and **Court Date** share one line.
  - Three boxes share the next line, and each label is a switch: **Search Warrant Number / Subpoena GJ Number**, **ASA Approving / AUSA Approving**, and **Judge Approving / Magistrate Approving**. Click the label to pick. The text stays when you switch, only the one you picked goes in the report and the PDF, and the PDF's label follows (e.g. *AUSA Approving Subpoena*).
  - **Pre-Recorded Funds:** **Add Funds** opens a small box. Pick the denomination and enter the serial numbers, one per line; the quantity counts them, or type it when not every bill was recorded. Each denomination shows as one line (e.g. *$20 × 3 AA01, AA02, AA03*) with Change and Delete. One **Recovered / Not Recovered** list at the lower right covers them all. Bills entered one by one before v1.54 are grouped by denomination by themselves.
  - The label under an evidence photo is one line.
  - **Extra Copies Required** is gone, from the form and from the PDF's signature table. That table now has the reporting officer's name with a tall signature box under it.
- **Reports → New Report:** the Type is **Case Summary**, **Affidavits** or **Other**, and the Title box is empty. Reports made before keep their type.
- **Arrest Report PDF:** *2nd Arresting Officer* is written like the 1st, so it no longer runs into the star box, and there is room before *Approving Supervisor*.
- **Mail tab** and **Vault:** fields are in grey boxes like the Draft tab. Each Vault section is a card that folds away with ▾ / ▸, and so do **LEO Partners**, **Suspects**, **Contacts** and **Deconfliction** on the Details tab. What you fold stays folded on this PC.
- **LEO Partners** shows only the agencies working this case. **Show All Agencies** brings back the others to pick from; **Show Only Working This Case** hides them again.
- **Quick Links:**
  - **OSINT** has **Geotime LIVE**. Its address isn't known to CaseVault: add your agency's in Vault → Quick links.
  - **LEO** has **Chicago HIDTA** going to its submission form (https://www.chicago-hidta.org/submission-form-2). It is fixed: always shown, and its address can't be changed.

### What's new in v1.53

- **Square drop-down lists everywhere.** Clicking a drop-down (or Alt+↓, F4, Space or Enter) now opens CaseVault's own square list instead of the browser's rounded one. ↑ ↓ choose, a letter jumps to it, Enter picks, Esc closes.
- **More colour icons:** search, hide, offline, the AI robot, PDF View, Word View, Draft with AI, Review, Export, Save, the Files folders and others are drawn in the same style as the rest. On a blue button the icon sits on a small white square.
- **Colours:** the page is a softer off-white, and icons sit on white tiles. The header buttons show their state with a coloured line under them: green is fine, red is off or a problem. The deadline bell is red.

### What's new in v1.52

- **Link Chart** tab on every case (after Files): who is under whom, with photos, monikers and webpages, ready to print in portrait. See *Link Chart* under *Files*.

### What's new in v1.51

- **New icons:** CaseVault has a new set of colour icons. Folders are coloured: Operations blue, General Files yellow, Closed green with a check, Archived dark. Trash, calendar, phone, map, notebook, chat, settings and more are in colour too. On blue (filled) buttons and on the Overview banner, the icons stay white. The banner itself is unchanged.
- **LEO Partners:** each agency has its own colour badge (CaseVault's drawings, not official seals). They never go on a report or PDF.
- **New logo:** the safe with the document is on the browser tab, at the top left and on the installed app.
- **Field Notes and Ask AI** (bottom right) are white squares with the colour notebook and chat bubble.
- **Updater:** the window opens with a blue fading banner like the Overview's: the title, the version on the SSD, and a shield with a padlock. The CaseVault logo is gone from it; it is still on the window's title bar.

### What's new in v1.50

- **Privacy screen:** the blue 1s and 0s now fall on a muted near-black. With a PIN, a thin box in the lower right says **AUTHENTICATE**, and each digit shows as an asterisk.
- **Supplementary Report PDF:** each box's label is on a grey band, and what you filled in is on white under it. This covers the signature table too (Extra Copies, Date Submitted, Reporting Officer…), as well as Update Information, Status and How Cleared. The Officer's Report part is unchanged.
- **Arrest details, Timeline, Contacts and Deconfliction** look like the Draft tab: each field is a grey box with its label small inside it, and the section headers are in capitals.
- **Dates:** the calendar button opens CaseVault's own square calendar. **«** and **»** change the year, **‹** and **›** the month; it also has **Today** and **Clear**, and works with the arrow keys and Page Up / Page Down.
- **Case list:**
  - The folders start folded. The folder holding the case, Operation or General Files on screen is open. A folder you open with its arrow stays open until you go to another page.
  - **Search** is an icon; click it to show the search box (Esc clears and hides it).
  - **Home** and **Hide** (the privacy screen) are next to Search; the header keeps only the menu ⋮.
  - A closed case of an Operation that is still open stays in that Operation's folder and also shows under **Closed**.
  - **Closed** and **Archived** at the bottom are grey folders with a drop-down arrow.
- **Move File** replaces Assign to… and Unlink. It moves a case into an Operation, from one Operation to another, or back to General Files. See *Operations and General Files*.
- **Discovery:** the list on the left can show files from this case, its whole Operation, another Operation, all cases or one other case, and the search box also finds case numbers and subjects. **Create Discovery Package** first opens **Ready to Copy**, a list of every file with its case and size and the total. **Copy Now** starts; **Back** changes nothing.

### What's new in v1.49

- **Discovery** on the Files tab: choose files on the left and they go to the list on the right. CaseVault then writes a password-protected package to a USB drive or folder, or onto the SSD for a DVD. The recipient opens it in Chrome or Edge with the password and can view and print, not download. Every page carries its Bates number. Video and audio play in the window, and an index lists every item with its fingerprint. A portable VLC can go along, and each production is logged in the case. See *Discovery* under *Files*.

### What's new in v1.48

- **Supplementary Report PDF:** the box at the top right is the **R.D. Number**. Event, Incident and Raid Number share the row under it. A form saved before keeps the number from that box as its R.D. Number. On the Draft tab the R.D. Number starts as the case's Case Number.
- **Draft tab:**
  - Every field is its own grey box with its label inside it. An empty box shows its label as the placeholder; once there is a value, the label sits small at the top of the box. A label too long to fit as a placeholder stays at the top, in full.
  - The section headers are in capitals.
  - An offender's phone numbers start folded away: **Show Phone Numbers** (with how many there are) opens them.
  - **Status** and **How Cleared** are spelled out (0 - In Progress, 3 - Cleared Closed, 3 - Referred for Prosecution…). Forms saved before read the same. The PDF keeps the short codes in its row of circles, as on the printed form.
- **Square drop-down lists** everywhere in Chrome and Edge: the list that opens under a box such as Status no longer has rounded corners.
- **Every report you send is its own:** sending the Draft tab again always asks **New Report** (the default) or **Update**. New Report leaves the report sent before exactly as it was, with its own sections, evidence and PDF. For example, a Purchase report without Evidence Inventoried and then a Surveillance report with it, or two Purchase reports (the UCO's and the surveillance officer's).
- **Templates:**
  - Only your DEA 6 sample stays. The first time v1.48 opens your vault, every other template is moved, not deleted, to `CaseVault-Data\templates\removed-v1.48`. Copy one back to `templates` to use it again.
  - There are no built-in starter templates.
  - The DEA 6 document type is now called **DEA Style**.

### What's new in v1.47

- **Overview:** a new **General Files** section sits between Operations and Recently Updated. It has a folder for each year (newest first) holding the cases that aren't in an Operation, filed by the year they were opened. Click a year to see its cases, each with Details, Reports and Files. **All Cases** opens the General Files page. The Operations section now holds only Operations.
- **General Files folders are amber** (Operations stay blue): on the Overview, in the case list, on the General Files page and on a case's header and Details bar.
- **Supplementary Report PDF:** the caption under each exhibit photo is no longer bold. Before, only its first line was.

### What's new in v1.46

- **Operations and General Files** (see *Operations and General Files* above): an Operation is now its own record (number, name, status, start and end dates, notes) and cases are linked to it. General Files lists every case. Link, unlink, add a new or an existing case, edit the Operation once for all its cases, and delete an Operation without losing a case or a file.
- **Case Number and Subject Name:** each case shows its Case Number with the subject under it, in the case list, the case's header, the Overview and General Files. Case Numbers must be unique; the same subject on another case asks first, and a similar name is pointed out.
- **First time you open your vault with v1.46:** vault.json is backed up, then cases that share a Title become an Operation. Nothing on the SSD moves; no file is copied.
- **Search** finds the subject and the Operation's number and name too.

### What's new in v1.45

- **Supplementary Report PDF**: same sections and order, laid out more neatly.
  - Every row of boxes sits on the same eight columns, so the lines run straight down the page.
  - Each label fits on one line.
  - Status and How Cleared take half the width each.
  - The Event, Incident, Raid and R.D. numbers are four equal boxes.
  - The officer's report labels are all one width, so the grey boxes start in the same place.
- **Arrest Report PDF**: every value is now in a light grey box.
  - Within each section the labels share one width, so the boxes line up.
  - Incident, Arrestee Vehicle, Court Info and Bond Info have two columns of the same width.
  - Charges, Recovered Narcotics and Warrants are grey rows on fixed columns.
  - The narrative and the properties sit on a grey background.
- **Draft tab and Arrest Details tab**: the entry boxes are more compact (tighter rows, shorter boxes).
  - On the Draft tab, Status and How Cleared fill a row together; Veteran shares a row with Tattoos / Scars; and a charge's Statute shares a row with its description.
  - On Arrest Details, every section uses four columns, and the arrestee's photo is the fourth column beside the offender's details. No box is left alone on a row.

### What's new in v1.44

- **PDFs:** times print as military time without the colon (**1435**), in both reports and in the report text. On the Supplementary Report every value sits in a light grey box (no dotted lines). Each offender, victim, officer or person present has their name in bold on its own line, with the details under it. The officer's report lines come in blocks with a little space between them: who; the court and the warrant; who else was there; the evidence and the money; the record numbers; vehicles and notifications. The layout is the same as v1.43.
- **Details tab:** **Title or Operation Name**, **Status**, **Opened** and **Closed** share one row, and **File Number**, **Original Case Number**, **Federal Jacket Number** and **Client** share the next. The Tags box is gone (tags saved before are kept and still found by the search box). The U.S. Marshals badge is now a star in a ring.
- **Overview:** an open operation's case numbers have three buttons: **Details**, **Reports** and **Files**.
- **Draft tab:**
  - **Method Code** and **Safe Method** have a list with **DNA** (does not apply); anything else can still be typed.
  - Number of Victims, Number of Offenders, Number Arrested and Method Code fit in one row.
  - For a person, Gender, Gender Identity, Race and Complexion fit in one row, and so do Height, Weight, Hair Color and Eye Color. The long race names are shortened on screen; the full name is what is saved.
  - In Assignment, Method Assigned, Unit Number, Safe Method, Arrest Unit and If Residence, Where share a row, and Adults, Juveniles, Fire and Gang Related share the next.
  - **Not Recovered** is no longer cut off in Pre-Recorded Funds.
- **Files:** the Size column is wide enough for "000 KB".

### What's new in v1.43

- **Supplementary Report PDF** (Draft tab → Print / PDF, Reports, Files) now looks like a narcotics division supplementary report form. It is set in Times, with the title and the **Agency Report Number** box at the top. Below that comes a ruled grid where each box has its small label: offense, IUCR, occurrence, victims, offenders and assignment. Then the **Update Information** tick boxes, **Status** and **How Cleared** with a round mark under the choice, and the Event, Incident, Raid and R.D. numbers. The officer's report follows as **LABEL:** lines, with each offender, officer, bill or vehicle on a line of its own, then the **Summary of Investigation** and a three-column signature table. Every other page starts with the four numbers and ends with **Preparer** and **Approval** initial boxes.
- **Arrest Report PDF** (Arrest Details → Print / PDF) now looks like a records-system arrest report. **ARREST REPORT** and the agency are at the top left, with the CB, IR, YD, RD and Event numbers stacked on the right and an **ARREST REPORTING** band under them. Each section is framed and named on a grey tab down the left: Offender (with the description in a column and the photo on the right), Incident, Charges, Recovered Narcotics, Warrant, Non-Offender(s), Arrestee Vehicle, Properties, Incident Narrative, Court Info beside Bond Info, and Reporting Personnel with the signature fields. Later pages repeat the CB number and the arrestee's name.
- Neither PDF has any agency's name, seal or form number built in: the agency comes from Vault → My Profile.

### What's new in v1.42

- **Overview:** the Upcoming Deadlines list is gone; the banner at the top already says what's due. Click an operation's folder and its case numbers show where that list was, each with buttons for every tab (**Details, Timeline, Draft, Reports, Files, Mail, Checks**), under the operation's timeline. The folders themselves stay where they are. The timeline's title and each event's title are centered.
- **Sidebar:** a cleaner look, with a new folder icon for each operation. An operation whose case numbers are all **Closed** moves to the **Closed** section at the bottom of the list, just above **Archived**.
- **Field Notes** are single spaced (no blank space between paragraphs), and the preview on the Reports tab no longer fades out at the bottom. Hovering over the Field Notes or a report no longer shows a hover box.
- **Reports list:** a report sent from the Draft tab shows by its type of activity (**Purchase**, **Surveillance**…); "Supplementary Report" is already in the Type column. The folder button on each row (and **Send to Files** in the report window) saves its PDF to Files, in place of the copy saved before.
- **Draft tab:**
  - **IUCR Code** holds just the code. The list shows each code with its description, and picking one puts the description in **Offense Classification**.
  - **Pre-Recorded Funds** is one compact row per bill: Denomination, Serial Number, Recovered. Quantity is gone.
  - **Notifications** no longer have a Notes box; notes written before become the Person Notified when that was empty.
  - **Exhibit numbering:** next to **Add Exhibit**, **Next Exhibit No.** shows the number the next exhibit gets. Type a number to start from there, click **Reset to 1** to start again (numbers this case already uses are skipped), or **Automatic** to number on as before (shared by cases with the same federal jacket number).
- **Files:** the Document column breaks only between words, so "Supplementary Report" is never cut.
- **Dev Tools:** the Document Anonymizer is laid out in numbered steps (Original, Fictitious, Keep It), and **Emergency Purge** sits apart in red with a skull and crossbones.

### What's new in v1.41

- **One draft, several reports:** each report sent from the Draft tab is named after its heading, such as **Supplementary Report - Purchase**, and so is its PDF in Files. If you change the **Officer Report Type** after sending (Purchase to Surveillance, say) and click **Send Draft to Reports**, CaseVault asks: **New Report** keeps the Purchase report as it was sent and adds a Surveillance report next to it; **Update** replaces the Purchase report (and its PDF). Sending again with the same type just updates that report. Two reports of the same type get "2", "3" on the end, so a PDF is never overwritten by another report's.
- **Exhibit photo names match the Draft tab:** a photo added to Exhibit 1 is saved as **Exhibit 1a**, the next as **Exhibit 1b**. Photos saved before as "Exhibit 1" and "Exhibit 1 (2)" are renamed to 1a and 1b the next time you open the Draft tab (only when that name is free).

### What's new in v1.40

- **Timeline:** **Clear** (next to Add to Timeline) empties the form: today's date, Event, no time, title or note. The date of each event now stays on one line next to its marker.
- **Reports are view only** (the Field Notes stay editable). Click a report, or its eye button, to see it as a PDF in the same window the Files tab uses. A report sent from the Draft tab has **Send Back to Draft** (in the list and in that window) to correct it; a report made with **New Report** has **Edit**.
- **Your own order:** drag a report by its grip (or focus the grip and press Alt+Up / Alt+Down). The order is kept on the SSD in the case's `reports-order.json`; new reports appear at the top.
- **Same PDF as the Draft tab:** every report sent from the Draft tab, not just the latest, prints from the form it was sent with, so it looks exactly like the Draft tab's Print / PDF.

### What's new in v1.39

- **Sidebar:** click an operation's name to open its Details; the arrow on the right folds it.
- **Suspects** (Details): IR Number, FBI Number, IDOC Number and Phone Number, with the description in even columns.
- **Offenders** (Draft): **Phone Numbers** (Add Another Phone) and **Monikers / Social Media** (a name and the app it's used on). Add From Suspects brings a suspect's phone along.
- **IUCR Code:** picking one (or typing a code in the list) fills **Offense Classification** with its description, for example *Delv: Synthetic Drugs*.
- **Officer Report Type:** the Draft tab's heading, the PDF and the report follow it: *Supplementary Report - Purchase*.
- **Purchase Price** (Officer's Report, above Pre-Recorded Fund Sheet): the wording (*$100.00 prerecorded 1505 funds in the form of:*), then **Add Bill** for each bill: quantity, denomination, serial number, and Recovered or Not Recovered. They print in the PDF and the report; both can be ticked off like every other line.
- **Draft buttons:** Show All and Hide All are at the top right; **Save Changes** is with Send Draft to Reports, Print / PDF and Clear All (the other two Save buttons are gone).
- **View-only reports:** a report sent from the Draft tab can't be edited under Reports. **Send Back to Draft** puts its form back on the Draft tab (asking first if another report is there); Send Draft to Reports then updates the same report and PDF. Reports sent before v1.39 didn't keep their form, so send them again from the Draft tab once.
- **Close Case:** asks who closed it (from My Profile), lists the operation's other open case numbers to tick, and, unless you untick **Update the Draft tab**, fills each one's Status and How Cleared (from the disposition, changeable) and ticks the Update Information boxes you choose.
- **Files:** a new exhibit photo is named *Exhibit 1* (no "photo"); the Added date stays on one line.

## Reports (field notes and drafts)

How a report comes together (v1.31), in tab order:

1. **Draft** tab: fill in the **Supplementary Report** form (see *The Draft tab* below). **Print / PDF** works straight from the form.
2. **Send Draft to Reports** (on the Draft tab, v1.33) puts the form under **Reports** as an editable report, laid out in the same rows and sections as the PDF (each row of boxes becomes a small table: labels on top, entries under them), and saves its PDF under **Files** (Supplementary Report folder). Sending again brings both up to date.
3. In the report editor you change the wording, use **Draft with AI**, **Re-phrase** or **Review**, and **PDF View** shows it as a PDF in the same style as the form, where you can print it, download it, or **Save PDF to Case**. **Export** still makes a Word file.
4. **Clear All** (on the Draft tab) empties the form to draft another report. What you already sent stays under Reports and Files; the next **Send Draft to Reports** makes a new report (**Supplementary Report 2**, and so on) with its own PDF.

**One report, one PDF (v1.32):** each draft you send is one report under Reports and one PDF in Files. As long as you haven't changed its wording under Reports, its **PDF View** is the very same PDF as the Draft tab's, and saving writes `<case>-Supplementary Report.pdf` in the Supplementary Report folder in place of the one saved before (no dates in the name, no "(2)" copies). Once you change the report's wording under Reports, its PDF follows your text, and **Send Draft to Reports** asks before replacing it.

The **Reports** tab starts with the **Field Notes** in their own section (v1.33): always there, at the top, with a preview of what you saved and **Open and Edit** (the **Notes** button at the bottom right of every screen edits the same notes). Under them, the case's reports (including Draft with AI's), each with its type and, in its own **AI** column (v1.34), a tag when Draft with AI wrote it. **New Report** at the top right asks for a title, a type and how to start (**Blank**, **Template** or **Draft with AI**; see *Drafts* below). Click a name to open it; **← All reports** goes back to the list. Old links to the Notes, Drafts or Report Fields pages open the same place.

**Tab indents** in the field notes and in every report, like in Word: **Tab** puts in an indent (with several lines selected, it indents each one) and **Shift+Tab** takes one off. Indents show in the Formatted view and become tab stops in the Word export. When an AI suggestion is showing in a report, Tab accepts it instead. To leave the box with the keyboard, press **Esc**, then **Tab**.

### Formatted or Markdown

Field Notes, every report and the Report Fields narrative open in the **Formatted** view: **bold** shows bold, underline is underlined, and headings, lists and tables look as they will in Word, with no `**` or `++` on screen. Type as in Word: **Ctrl+B / Ctrl+I / Ctrl+U**, the buttons on the formatting bar, **Enter** for a new paragraph, **Shift+Enter** for a new line in the same paragraph, **Enter** twice to leave a list, **Tab** to indent. Every `[CONFIRM: ...]` is highlighted yellow, as in the Word export.

- **Paste from Word** (or Outlook, or a web page): bold, italic, underline, headings, lists and tables are kept; fonts, colours and pictures are left out.
- **Copy for Word:** select text in the Formatted view and press Ctrl+C. It pastes into Word with its formatting. **Export** is the way to get a Word file.
- **Markdown** (next to Formatted) shows the same text with its marks (`**bold**`, `++underline++`, `# heading`), as before v1.19. AI suggestions while you type work in this view. CaseVault remembers your choice on each PC.
- The file on the SSD stays plain text with those marks (`notes.md`, the draft's `.md`), so templates, Draft with AI, the checks and the Word export work just as before.

### Field Notes

**The Notes button** (square, bottom right, next to **Ask AI**) opens the Field Notes in a floating box, like Ask AI, so you can write notes while you look at the Details, Files or Timeline. It shows the notes of the case you have open (or pick another case from its list), saves to the same `notes.md` a moment after you stop typing (or **Save**), and has the same formatting bar. Drag it by its title bar, resize it from its corner, make it bigger, minimize it, or open the full Field Notes page with the arrow button. Spell check underlines misspelled words here, in Field Notes, the reports and the Ask AI box.

**Field Notes** is a large free-form page, saved as `notes.md` in the case folder. In the Markdown view, the formatting is written like this:

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

Notes save on their own as you type. The **Save** button writes them straight away, and the text beside it shows *✓ Saved 14:02* once they're on the SSD. **Delete** on the Field Notes row empties the notes after you confirm.

### The Draft tab (the Supplementary Report)

The **Draft** tab (between Timeline and Reports, where Report Fields used to be) is the case's Supplementary Report, laid out like a narcotics supplementary report form:

- **Include boxes:** every part has a tick box on the left of its heading. Untick a part that doesn't apply: it folds away and is left out of the PDF, the report made from the fields and Draft with AI.
- **Fold buttons:** the arrow on the right of each part's heading only hides it on screen, to keep the page short while you work (it stays in the PDF). **Hide All** and **Show All** at the top fold or open every part. The folds are remembered in this browser.
- **Case Numbers:** agency report number (filled from the case's federal jacket number), event, incident, raid and R.D. numbers, and the officer report type (Investigation, Purchase, Surveillance, Correction).
- **Offense:** offense classification / last report, IUCR code (search and pick from **Common UCR**; an empty offense classification fills in with its group, such as Narcotics) and location code (search and pick from **Location Codes**; **Type of Location** fills in from the code). The ▾ button shows the whole list, and you can still type anything that isn't in it. address and type of location, date, time and beat of occurrence, beat assigned. (The offense reclassification / DNA and revised IUCR row was removed in v1.31.)
- **Victims and Offenders:** the number of victims, offenders and arrested, the method code, and **Add Victim** / **Add Offender** for each person (or **Add From Suspects** to bring in every named suspect from the Details tab: name, date of birth and age; the description of the day goes here, in the report): name, relation code, date of birth, **age** (worked out from the date of birth), gender, gender identity, race, complexion, height (**feet** and **inches** boxes), weight (in **pounds**), hair color, eye color, veteran (Yes / No), tattoos / scars and clothing description. For a victim, pick **State of Illinois** from the list, or type a name. A **State of Illinois** victim has only two boxes, the name and **Officer Name** (the officer for the State); the other victim boxes go away. The bin button deletes an entry. For an offender whose name isn't known, tick **Unknown Offender**: the name becomes *Unknown Offender* (you can change it), the date of birth is set aside, and age, height and weight become ranges (*from … to …*), printed as *Age Range*, *Height Range* and *Weight Range*.
- **Assignment:** method assigned (Field, Supervisor, On View, OEMC), unit, safe method, if residence where, arrest unit, adults, juveniles, fire and gang related.
- **Update Information and Status:** the verified / updated tick boxes, status (0 - Prog to 7 - C/N/C) and how cleared (1 - Arrest to 5 - Other).
- **Officer's Report:** one line each, in this order: Operation / Mission Number, Within 1000 FT Of, Court Branch and Court Officer, Court Date, Search Warrant Number, Subpoena GJ Number, ASA Approving Search Warrant, **AUSA Approving Search Warrant**, Judge Approving Search Warrant, Pre-Recorded Fund Sheet, Evidence Officer, Proof of Residence, **IR Number** and **CB Number**. Every line has a tick box (v1.34), and so does each list under them (Narcotics Recovered, Charges, Gang Affiliations, Persons Present Not Arrested, Police Personnel, Vehicles, Notifications): untick one that doesn't apply and it's greyed out and left out of the PDF and the report. The labels are written the same way throughout, not in capitals.
  - **Narcotics Recovered** (under the judge line): **Add Narcotic** for each narcotic, on one line: **Narcotics Type Recovered** (pick from the list or type), **Total Weight** with its **Unit** (gram, ounce, pound, kilogram, pill, mL), **Purchase Price** and **Street Value**. **Calculate** next to the street value works it out with the narcotic calculator (Reference → Narcotic calculator, HIDTA 2022 prices) from the type, weight and unit, and shows the line it used; you can type over it. Reports saved before v1.25 keep their total weight, street value and purchase price as the first narcotic.

  Then lists you add to, as many as needed:
  - **Charges:** statute and statute description. Type part of a statute or of its wording (for example *fentanyl 15* or *402(c)*) and pick from the charges list; both boxes fill in. The list is also in **Reference → Charges**, grouped as **Illinois** (delivery, possession, trafficking and conspiracy, weapons) and **Federal** (narcotics; mail, parcels and online, such as 21 U.S.C. § 843(b) use of a communication facility including the mail, 18 U.S.C. § 1716 mailing injurious articles and the Travel Act; weapons). Anything else can be typed. LSD and psilocybin are Schedule I hallucinogens: the list has *Possession* (402(c)) and *Manufacture/Delivery, other amount* (401(e)) for each. The weight-based tiers for larger amounts aren't in the list; confirm those subsections with your ASA and type them in.
  - **Gang Affiliations:** pick a gang from the list (Chicago street gangs, then national and foreign gangs and cartels) or type one, and the faction or set.
  - **Persons Present Not Arrested:** name, contact number and address.
  - **Police Personnel on Scene:** name, star number, unit and role (Case, Affiant, Entry, Perimeter, UCO, Surveillance, Enforcement, Sergeant, Lieutenant, Agent, Other).
  - **Notifications:** date, person notified, who notified them, and notes.
  - **Vehicles:** year, make, model, color, license plate and state, VIN, **Impound / Tow** (Impound, Tow, Other) and owner and notes.
- **Evidence Inventoried:** **Add Exhibit** gives the next exhibit number by itself. Every case with the same **federal jacket number** shares one count (an operation with several case numbers doesn't start again at 1), and a removed exhibit's number isn't given out again. Each exhibit has an **Inventory Number**, a **Type** (Narcotics, Currency, Personal Currency, Personal Property, Personal Jewelry, Jewelry, Electronics, Video/Audio, Photograph, Packaging, Other) and a long **Description**. Choosing **Narcotics** adds **Narcotic Type** (Cannabis, Cocaine, Heroin, Fentanyl…) and **Weight**. The big **Add Photos** tile (camera) adds pictures of the exhibit: they're saved in the case's **Drug Exhibits** (or **Other Exhibits**) folder and shown as same-size thumbnails labeled with the exhibit number and a letter (**1a**, **1b**…); click one to view it. Type a **label** under each photo (v1.34; for example *Front of the bag*); it's printed in that photo's caption. The x takes a photo off the exhibit (it stays in the case files). In the PDF, the photos come after the report on **Exhibit Attachments** pages: two to a portrait page, as large as fits, each with its label (Exhibit 1a…), inventory number, description and your photo label under it.
- **Summary of Investigation:** a large box for the narrative, with the formatting bar.
- **Submission and Approval:** one row per officer (Reporting Officer, Secondary Reporting Officer, Supervisor) with star number, date and time, then extra copies. The signatures are left for ink or e-sign.

The buttons above the form:

- **Print / PDF** shows the report in CaseVault's own viewer: **−** and **+** zoom (the percent shows between them and starts at **100%**; Ctrl + mouse wheel works too), **100%** goes back to actual size and **Fit Width** makes the page as wide as the window. The pages scroll inside the viewer right down to the signatures. **Print** sends the PDF to the printer, **Download** saves it.
- **Send Draft to Reports** puts the form under **Reports**, laid out like the PDF (with **PDF View** to see it as a PDF again), and its PDF in the case's **Supplementary Report** folder under **Files** (in place of the one sent before). To send the PDF to sign, attach it from the **Mail** tab.
- **Clear All** empties the whole form, after asking, to draft another report. Reports and Files keep what was sent; the next send makes a new report and PDF.

The header of the printed report shows your agency from **Vault → My Profile**. Fields save as you type (and with **Save Changes**), in the case folder as `report-fields.json`; fields saved by v1.18 and v1.19 open in the new layout. They fill `{{report.…}}` placeholders in templates (for example `{{report.ucr}}`, `{{report.evidence}}`, `{{report.narrative}}`) and go to **Draft with AI**.

## Timeline

Add dated **Events** (things that happened) and **Deadlines** (things that are due), with an optional time and note.

The Timeline covers the whole **Operation**: the events of every case linked to the same Operation are shown as one list, each marked with its case number. When the operation has several case numbers, the **Case Number** box says which one an entry belongs to (editing an entry can move it to another). Each case still keeps its own `timeline.json`.

- **Dates, phone numbers and SSNs** are written the same way everywhere:
  - **Dates** show in full everywhere, on screen, in reports and PDFs: `September 30, 2026` (v1.32). Type one as `09302026`, `9/30/26`, `09.30.2026` or `September 30, 2026`, or click the calendar button; it shows in full when you leave the box.
  - **Phone numbers:** `123.456.7890`. Type the digits, or paste one in any format, and it's tidied when you leave the box.
  - **SSNs:** `123.45.6789` (for example on the Arrest details tab).

  Dates in templates are filled in the same way (`{{suspect.dob}}`, `{{arrest.date}}`).
- **Time:** type it (`0930`, `9:30`, `9:30 pm` and `21:30` all work; it becomes `09:30` or `21:30` when you leave the box), or click the **clock** button, pick the hour and minute, and press **Set time**. **Now** fills in the current time, **Clear** empties it, and Esc closes the picker without changing anything. The arrest and Miranda times on the Arrest details tab work the same way. The small **24h / 12h** button in every time box switches all of them between military time (21:30) and regular time (9:30 PM); CaseVault remembers the choice. The time is saved the same either way.

- Entries are always sorted by date.
- Deadlines show *due today*, *in N days* (amber within a week), or *N days overdue* (red).
- Tick the checkbox on a deadline when it's done. It's crossed out and no longer counts as upcoming.
- **Edit** loads an entry back into the form. **Delete** removes it after you confirm.
- Each case's next open deadline also appears in the left list and on the Overview screen.

## Files

Every case has the same document folders, both in CaseVault and on the SSD (`cases\<case>\files\...`):

> Case Overview · Case Initiation · Warrant Drafts · Warrant Final · Arrest Report · Supplementary Report · Case Report · Deconfliction · Drug Exhibits · Other Exhibits · Email · Ops Plan · Subpoena Drafts · Subpoena Response · Subject Information · Recordings (with **Video** and **Audio** sub-folders) · Vehicle Information · Maps · Case Closing · Other

Affidavits are kept with their warrants, in **Warrant Drafts** and **Warrant Final**. Folders that are no longer used (**Affidavits** from before v1.11; **Warrants Signed** and **Subpoena Sent** from before v1.13; **Affidavit Drafts** and **Affidavit Final** from before v1.15) still show, and work, while they hold files. Open one and click **Move them to Warrant Final** (or Warrant Drafts, or Subpoena Response) to move its files into the folder that replaced it. Affidavits keep their names; other files are renamed by that folder's convention. New files never go to them.

### Arranging folders and files

- **Folders:** click **Arrange folders** under the folder list. Use the up and down arrows (or drag a folder in that list), then **Save order**. **Standard order** puts them back. You can also drag a folder in the list itself, or select it and press **Alt+↑ / Alt+↓**. The order is the same in every case; Video and Audio stay under Recordings.
- **Video and Audio** are folded away under **Recordings** until you click Recordings or the arrow next to it. Each folder's icon is at the right end of its row, after the file count.
- **Move a file:** drag it from the table onto a folder on the left. It's renamed by that folder's convention, like **Move / rename**.
- **Sort:** click a column heading (Name, Document, File, Size, Added) to sort by it; click again to reverse.
- **Your own order:** in a folder, click **Custom** and drag the rows into the order you want. It's kept for that folder in the case (`file-order.json`).

The table has one row per file with clear lines: **Name** shown as `2024-JH123456 | scan0001` (the case prefix, then the file name; with the folder underneath in *All documents* and *Photos*; a long name ends in "…", and pointing at it shows the whole name), **Document** (the folder: Arrest Report, Case Report…), **File** (the format, for example `.docx`), **Size**, **Added** (month.day hour.minute, for example `09.30 08.57`), and the **Open**, **Move / rename** and **Delete** buttons.

### Naming convention

- A **new case folder** is named `<year>-<case no.>`, for example `2026-00123` for case 00123 opened in 2026 (the year comes from the **Opened** date). If that name is taken, CaseVault adds `-2`. A case created without a number gets a dated name; add the number on **Details**, then use **Rename folder to 2026-…** there. Every file is copied and checked before the old folder is removed.
- **Every file** you save is named `<year>-<case no.>-<file name>`, for example `2026-00123-scan0001.pdf` or `2026-00123-bank records.pdf`. The file name is the original's unless you type another in **File name**; the folder it's in shows as its **Document** type in the table. A second file with the same name gets ` (2)`. Files named the older way (`2026-00123 Arrest Report.pdf`) still count as following the convention.
- A case number that already starts with the year (`2026-00123`) isn't doubled.

### Discovery (v1.49)

**Discovery** (under the folder list on the Files tab) makes a password-protected package of the files you choose, for a USB drive or a DVD.

1. **Pick the files.** The case's files are on the left. The list at the top switches to this case's whole Operation, another Operation, all cases or one other case (v1.50), and the search box finds file names, case numbers and subjects. Click one to add it to **To Produce** on the right. There, the arrows set the order and the X takes one off. The total size shows at the top: one DVD holds about 4.3 GB.
2. **Fill in:**
   - **Produced To**, for example the ASA, the AUSA or defense counsel.
   - **Bates Prefix** (DISC unless you change it) and the **Bates Start Number**, which continues from this case's last production with that prefix.
   - **Where To:** a USB drive or folder you pick, or the SSD for a DVD.
   - A **password** of at least 8 characters, twice. CaseVault does not keep it. Give it to the recipient separately, by phone, never with the drive.
3. **Create Discovery Package.** First **Ready to Copy** lists every file going in, in order, with its case and size, and the total (with VLC if it goes along). **Copy Now** goes ahead; **Back** changes nothing. Then, in the place you chose, CaseVault writes a folder named `Discovery <date> (DISC-000001 - DISC-000040)`. Neither the folder nor anything else in the package shows a case detail without the password. The folder holds:
   - **Open Discovery.html**, the viewer;
   - **data**, every file encrypted (AES-256);
   - **README - Start Here.txt**;
   - **VLC Player**, when it's on the SSD (below).

**What the recipient sees:** they open *Open Discovery.html* in Chrome or Edge (nothing to install), type the password, and choose the package folder when the browser asks.
- **Documents:** each PDF page is shown as a page picture with its Bates number in the corner, on screen and on paper. Word documents and spreadsheets show as read-only pages, and text files as text. There is no download button, no right-click menu and no Save.
- **Video and audio** play in the window.
- **Index:** **Print Index** prints the index, which lists every item, its Bates numbers, pages, size and the SHA-256 fingerprint of the original file.
- **Recordings the browser can't play** (AVI, WMV, DVR formats such as .dav): **Save a Copy** lets the recipient open them in VLC. You can switch that off with the box "Allow saving a copy…".
- **Bates numbers:** one per page for PDFs, one per file for everything else.

The files in the case are never changed. The fingerprints in the index are of the originals on the SSD.

**What the case keeps:** each production is listed under **Earlier productions** in the Discovery window, with its date, recipient, Bates range and files. **Index** opens its index PDF. These are stored in the case folder: `discovery-log.json` and `discovery\Discovery Index ….pdf`.

**For a DVD:** choose **The SSD, for a DVD**. The package goes to `CaseVault-Data\exports`. Put a blank disc in, open that folder in File Explorer, select the package folder and choose **Burn to disc** (right-click → Send to → the DVD drive, or Share → Burn to disc).

**Adding VLC (once):** VLC is a free media player (GNU GPL), and you may hand out copies.
1. On a computer with internet access, download the **portable (zip)** version of VLC for Windows from videolan.org.
2. Unzip it.
3. Copy everything inside the unzipped folder (vlc.exe, the plugins folder, COPYING.txt…) into `CaseVault-Data\discovery-kit\VLC` on the SSD. Create those folders if they aren't there.

From then on the **Copy the VLC player along** box is ticked by itself, and every package gets a **VLC Player** folder with VLC's license in it.

### Link Chart (v1.52)

The **Link Chart** tab (after Files) draws who is under whom in the case, for a briefing or a prosecutor. Each case has its own chart, saved in the case folder on the SSD (`linkchart.json`). Its PDF goes into the case's **Files → Link Charts**, so you can attach it to mail or add it to Discovery like any other file.

- **Add Subject** puts a person at the top. To put a card under someone, pick them in the list on the left. Then use **Add Person Under** (a supplier, courier, associate…) or **Add Moniker / Page** (an online name or a webpage they use). **Add Page** puts a webpage or dark-web name on its own at the top.
- **Each card:**
  - **Kind**: Person, Moniker or Webpage, Phone, Crypto Wallet, Location or Other.
  - **Role** for a person: Subject, Supplier, Courier, Associate, Customer, Source or Other. Each role has its own colour on the card.
  - **Platform** for an online name: Webpage, Dark Web, Google, Snapchat, Facebook / Instagram, Telegram or Other. Each has its own picture.
  - **Name**, and an **Alias / Moniker**, **Handle or URL**, number or address.
  - **Under**: move the card somewhere else in the chart.
  - **Delete Card**: the cards under it move up one level.
- **Photos:** a person's **Photo** is a picture from the case's files. **Add Photo** adds one to Subject Information and uses it. Every photo is shown as the same square (head shots are cropped to fit), and a person without one gets a plain outline.
- **Other Connections** draws a dashed line, with a short label, between two cards that aren't one under the other: the same phone, money sent, met at…
- **Layout:** the chart lays itself out top down. When someone has five or more people or pages under them, and none of those have anyone under them, they go in rows of four, so a big crew still fits a portrait page.
- **PDF View** shows the chart on a letter-size portrait page with its title, the case number and subject, and the date printed; from there you can print or download it. **Save PDF to Case** saves it as `Link Charts\<case>-<title>.pdf`; saving again replaces it. No agency name, seal or badge goes on the page.
- An archived case shows its chart read-only.

### Adding files

**Photos**, under *All documents* on the left, lists every picture in the case (JPG, PNG, HEIC…), whatever folder it's in.

Pick a folder on the left and drop files onto the box (or click **choose files**). With **All documents** selected, CaseVault asks the document type for each file, with a guess from its name (for example `supp 2.pdf` → Supplementary Report, `search warrant signed.pdf` → Warrant Final, `PC affidavit draft.docx` → Warrant Drafts, `case overview.docx` → Case Overview, `interview.mp3` → Recordings › Audio, `bodycam.mp4` → Recordings › Video), and shows the name it will be saved under. Files are **copied**; your originals aren't changed.

- **Open** previews PDFs, images, text, audio, and video right inside CaseVault. Excel and CSV files open as tables (see below).
- **Word files (.docx)** open inside CaseVault as a readable, read-only page: headings, bold/italic/underline, numbered and bulleted lists and tables are kept; fonts, spacing and pictures aren't. Open the file in Word for the exact layout. Old **.doc** files can't be shown: open them in Word and *Save As* .docx.
- Other types can't be previewed. CaseVault shows you where the file is on the SSD, so you can open it from File Explorer.
- **Move / rename** moves a file to another folder, or renames it by the convention (the copy is checked before the original is removed).
- A small **name** badge marks a file that doesn't follow the convention.
- **Delete** permanently removes the file from the SSD after you confirm.
- Files added with CaseVault 1.8 or earlier sit in **Unsorted**. Use **File it…** on each to put it in its folder with a conventional name.
- Drafts exported to the case (**Export → Save to case files**) are filed too: affidavits in Warrant Drafts (named *… Warrant Draft - Affidavit …*), subpoenas in Subpoena Drafts, summaries and DEA-6 reports in Case Report, others in Other.

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

**Ask AI** in the header opens a chat, like claude.ai, with the AI **on this computer**: nothing you type leaves the PC, and it works offline. It opens in a **floating box** in the corner, so you can keep writing a draft or your notes, or move between tabs and cases, while it answers.

- **The box:** drag its title bar to move it and its bottom-right corner to resize it. The buttons on the title bar are **New chat**, **History** (your saved chats: open one to carry on, or delete it; **Delete all** asks twice), **Clear** (the fire icon: empties this chat and deletes its saved copy), **Save to case**, **Bigger** (a large box in the middle of the screen; click again for the normal size), **Minimize** (just the title bar; Esc does the same) and **Close**. Closing keeps the conversation; **Ask AI** brings it back.
- **Model:** every AI model installed in Ollama on W: (and the in-browser model, if that's what's running). Your choice is remembered in the vault. See *Other models* in [AI-SETUP.md](AI-SETUP.md) to add one, including a less-filtered model.
- **Case:** until you ask your first question, it follows the case you have open. Or pick any case, or *No case* for general questions. The case's details, contacts, timeline and notes go with each question, and the AI is told to answer from them and say where each fact comes from. **Search the case files** also reads the case's documents and sends the passages that answer your question (slower the first time a document is read).
- Type and press **Enter** (Shift+Enter for a new line). **Stop** ends an answer early and keeps what's written. Earlier questions and answers go along, so you can ask follow-ups; the oldest drop off when the AI's window is full.
- Answers are formatted (lists, tables). Under each answer: **Copy**, and **Insert**, which puts the answer where your cursor was in the draft or notes you were last typing in (click in it first). It saves like your own typing.
- Each chat is saved on the SSD (`CaseVault-Data\chats\`) after every answer, never on the PC, and listed under **History**. **Save to case** also saves it as a report in a case; **New chat** starts a fresh one.
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
4. **Include AI review** is available when the header shows the AI model, such as **AI: Quick · qwen2.5:7b**. Without it, the rule-based checks still run.
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

Names spelled with two letters swapped (*Sampel / Sample*) are flagged too. `00123` and `2026-00123` count as the same case number. Your own details from **My Profile** and today's date (a template's signature block and *Prepared …* line) are never reported as "not found in the reports".

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

To hide CaseVault instantly, for example when someone walks up to your desk, click **Hide** (the crossed-out eye) at the top of the case list. It also hides by itself after the idle time you set (below). Since v1.21 there are no keyboard shortcuts for it.

A muted near-black screen with blue 1s and 0s raining down covers the whole app, with no case names or data on it. The browser tab's title changes to **New Tab** and its icon goes blank. Audio and video pause, any open file preview closes, and any unsaved edits are written to the SSD first. If Windows is set to reduce animations, the rain stands still.

**To come back:** click anywhere. If you set a PIN, a thin box in the lower right says **AUTHENTICATE**. Type the PIN (each digit shows as an asterisk) and press Enter; it also unlocks by itself once you've typed 6 digits. After 5 wrong PINs you have to wait 30 seconds. Esc does nothing on the privacy screen: with a PIN set, only the PIN opens it.

**Settings** (in **Vault → Privacy screen**):

- **Set PIN / Change PIN / Remove PIN.** 4 to 6 digits. It's stored in `vault.json` on the SSD as a salted SHA-256 hash, never the PIN itself, so it goes with the SSD to every PC.
- **Hide automatically after** 1 to 30 minutes without mouse or keyboard activity. **15 minutes** unless you choose another time or Off.

> The privacy screen only hides what's on the screen. It isn't encryption, and anyone at the PC could close the browser tab. **For real security when you leave, press Windows key + L to lock the PC.**

## Department mail (Mail tab)

The **Mail** tab of a case prepares an email to your department with documents from that case. CaseVault never sends mail itself and never holds a mail password: it checks the message, then hands it to Outlook, and you press **Send** there, so your department's own mail system (encryption, retention, DLP) handles it.

**One-time setup** in **Vault → Department mail**: your department's mail domain(s), for example `agency.gov` (exactly that domain) or `*.agency.gov` (it and its sub-domains); an optional address book; an optional subject marking such as `[LES]` (can be made required); a **signature** (added to the end of every new message, above the footer; **Fill From My Profile** makes one from Vault → My Profile); the footer; and the attachment limit (20 MB by default). **chicagopolice.org**, **dea.gov** and **uspis.gov** are filled in as the allowed domains to start with (and are added once to a list set up before v1.27); change the list to suit.

**Safeguards**, checked every time:

1. **Recipients** must all be in the department's domains. Any other address is blocked, not just warned about.
2. **Attachments** come only from this case, must stay under the size limit, and a file whose name carries a different case number is flagged.
3. The **subject, message and every readable attachment** are scanned for personal details (see below). The review screen lists what was found. If it finds an SSN, date of birth, ID, card or bank number, you must type `SEND` to go ahead.
4. You tick **I have checked the recipients, the text and the attachments**.

Then:

- **Check & create Outlook draft** saves the message in the case's **Email** folder as `2026-00123 Email - <subject>.eml` and opens it in Outlook (with Start-CaseVault.bat running) as a new email with the attachments already in it. In Chrome/Edge direct mode, CaseVault shows where the file is; double-click it in File Explorer. This works with classic Outlook for Windows; the new Outlook may open it read-only, in which case attach from the Email folder by hand.
- **Check & open in mail app (text only)** hands subject and message to your default mail app with a `mailto:` link. No attachments.

Every hand-off is listed under **Mail prepared from this case** (saved in `mail-log.json` in the case folder) and in the outbound log.

- **Save changes** under the mail settings saves them to the SSD at once (they also save as you leave each box).
- **Discard draft** clears the message you're writing (after asking, if you typed anything).
- **Delete draft** next to an Outlook draft in the list deletes its `.eml` file from the Email folder. The line stays in the list as *Draft deleted*, so the record of what was prepared is kept. Mail already sent from Outlook isn't affected.

## Online research & drafting (optional)

CaseVault is offline by default. If your agency allows it, you can ask Claude research and drafting questions, with personal details hidden first.

1. **Vault → Online features → Allow Going Online** (one time).
2. Click **Offline** in the header (it becomes **Online · 15 min** once you go online). CaseVault goes offline again after 15 minutes without use (changeable), whenever it starts, and when the SSD is unplugged.
3. Choose the **service**, the **purpose** (Research or Drafting) and, optionally, the **case**. With a case, its client, number and drafts are available: **Insert a draft from this case**.

**Services:**

- **claude.ai (my Claude subscription)**: a Claude Pro/Max subscription can't be connected to other apps, so CaseVault does it the safe manual way. It hides the details, copies the result, and opens claude.ai in a new tab. Paste it there, then paste Claude's answer back into CaseVault, which puts the real names back on this computer.
- **Anthropic API** (optional): Claude's answers appear inside CaseVault. Needs an API key, **billed separately** from a subscription. See *Setting up the API key* below.
- **Google Gemini** (optional, **free tier**): Gemini's answers appear inside CaseVault. Needs a free API key from Google AI Studio. See *Free API keys: Gemini and OpenRouter* below.
- **OpenRouter** (optional, **free models**): one key for many AI models, including free ones (names ending in `:free`). See below.

**What happens to your text:** every message goes through the same review screen. Names, SSNs, dates of birth, IDs, phone numbers, emails, addresses, plates, VINs, case numbers and card/bank numbers are replaced with placeholders like `[NAME_1]` and `[PHONE_1]`. Those can't be un-ticked. Possible names found by pattern can be un-ticked (for example a court's name). **Hide this too** adds anything the scan missed. The box *Exactly what will be sent* shows the final text. The same person keeps the same placeholder for the whole conversation, and answers are shown with the real values put back (untick *Show real names* to see what Claude saw). **Save to case as draft** keeps an answer in the case's Drafts, marked AI-assisted.

Phone numbers are found with or without the area code (`555-0142`), and plates with or without the word "plate" (`TST-1284`). When details overlap, for example your own surname inside a street address or an email, the whole address or email is hidden, not just the name (v1.9.1).

Detection is a safety net, not a guarantee. Always read the text before you send it, and add names CaseVault should always hide to **Vault → Always hide**: subjects, informants, nicknames, street names.

Only `api.anthropic.com`, `generativelanguage.googleapis.com` (Gemini) and `openrouter.ai` can ever be reached (the page's security policy blocks every other address), only with text you reviewed, and each review allows one request. Case files are never sent automatically.

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

### Free API keys: Gemini and OpenRouter (optional)

Both work like the Anthropic key: **Add API key…**, where to keep it (session, locked with a passphrase, or plain on the SSD), **Test key**, **Remove API key…**. They're in **Vault → Online features → API keys**, and on the online page when you pick that service. Each card has **How to get … API key, step by step**, with links that open in a new tab.

> **What "free" costs.** On Gemini's free tier, Google may use what you send to improve its products, and human reviewers may read it. Free OpenRouter models are run by other companies, and some log or train on what you send. CaseVault hides names and numbers before anything goes, but only send what your agency's policy allows. For case work, prefer the local AI (Ask AI) or a paid API.

**Google Gemini (free tier):**

1. Open [aistudio.google.com](https://aistudio.google.com/) and sign in with a Google account your agency allows. Accept the Gemini API terms, and read the free-tier part.
2. Go to **Get API key** → **Create API key**. If it asks for a Google Cloud project, let it create one. Name it after the PC, for example `CaseVault - L14`.
3. Copy the key. It starts with `AIza` and is 39 characters long.
4. In CaseVault, click **Add API key…** on the Gemini card, paste it, tick that you understand the free-tier terms, and click **Save key**.
5. Go online and click **Test key**. It lists the Gemini models. Flash models (for example `gemini-2.5-flash`, the default) have the most free use. Pick one in the **Model** box on the online page.
6. The free tier has limits per minute and per day. When you reach one, CaseVault shows the error: wait a minute, or try tomorrow.
7. To stop, click **Remove API key…**, then delete the key in AI Studio under **API keys**.

**OpenRouter (free models):**

1. Open [openrouter.ai](https://openrouter.ai/) and sign in with Google, GitHub or an email address.
2. Recommended: in **Settings → Privacy**, turn off providers that may train on your data. Fewer free models are then available, but those left don't keep what you send for training.
3. Go to **Settings → Keys → Create Key**. Name it after the PC, and set a **credit limit** (0 if you only want free models).
4. Copy the key. It starts with `sk-or-v1-`, and OpenRouter shows it only once.
5. Add it on the OpenRouter card in CaseVault, tick the box, and click **Save key**.
6. Go online and click **Test key**. It lists the free models (names ending in `:free`). Type or pick one in the **Model** box. The default is `meta-llama/llama-3.3-70b-instruct:free`. Free models have a daily limit, higher once your account has bought some credit.
7. To stop, click **Remove API key…**, then delete the key in **Settings → Keys**.

Model names change over time. If one stops working, click **List models** on the online page and pick another.

### Outbound log

**Vault → Outbound log** lists every online AI request and mail hand-off of the last two months: when, where, why, what kinds of details were found, and how many were hidden. Never the text itself. The logs are in `CaseVault-Data\logs\outbound-YYYY-MM.json`.

## Options

**Menu → Options** has two tabs:

- **Display:** **Zoom** (70–160 %) makes everything bigger or smaller, and **Brightness** (50–130 %) darkens or lightens CaseVault, for example in a dark room. Use the slider or the − and + buttons; **Reset** goes back to 100 %. They're kept in the browser on this PC, like the theme, so each PC has its own.
- **Dev Tools → Document Anonymizer:** turns a real template, report or reference into a fictitious one you can keep as a template or give the AI to learn from.
  1. Paste the text into **Original** (the big box), or drop a Word (**.docx**), Markdown (**.md**) or text (**.txt**) file on the box above it (or click it to choose one). Only its text is used; the file isn't changed.
  2. Optionally, under **Other names to replace**, type names the rules might not recognise, such as nicknames.
  3. Click **Anonymize**. First the rules swap the details: names become John Doe, Jane Doe, Richard Roe and so on (the same person always gets the same filler, written the same way, for example *DOE, Jane* or *JOHN DOE*); phone numbers become (555) 555-01xx, addresses 100 Main Street, Anytown; dates of birth, case numbers, emails, plates, VINs and ID numbers get fillers too. `{{placeholders}}` and `[CONFIRM: …]` stay as they are. Then, when the local AI is running, it reads the result for anything the rules missed, and the rules run over its version once more. **Stop** keeps the rules' version. The line under the buttons lists what was replaced.
  4. The result appears in **Fictitious**, under the original. Read it through and edit it if needed, type a **Name**, then **Copy** it, **Save Template** (Vault → Templates) or **Add to Library** (Report Examples). **Clear** empties both boxes.

  Everything happens on this computer: the rules run in the browser, and the AI is Ollama on `127.0.0.1`. Nothing goes online. Detection is a safety net, not a guarantee, so always read the result before you save it.
- **Dev Tools → Emergency Purge:** deletes everything CaseVault keeps on the SSD at once: every case and archived case (files, photos, drafts, notes, timelines), the backups of `vault.json`, Ask AI chats, logs, templates, the Library, saved API keys and `vault.json`. CaseVault's preferences in this browser and the remembered vault folder are cleared too. Type **PURGE** to confirm. There is no undo. See *What deleting leaves behind* below.

## Contact Dev

**Menu → Contact Dev** writes a bug report or feature request.

- Choose the kind, give it a title and describe what happened. **Include the app version, browser and screen size** adds those details, which contain no case data.
- **Email it** opens a new email to the developer in your email program, filled in. You check it and press Send yourself. Put the developer's address under **Where reports go** once; it's saved in `vault.json`.
- **Open bug form** copies the report and opens the bug report form in a new browser tab; paste it there. Put your own form's address (for example a Freeform form) under **Where reports go**; empty, it opens the CaseVault issue page on GitHub.
- CaseVault refuses to send a report that contains a phone number, email address, date of birth or similar. Never put case details in a report.

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

The memory icon in the header is a small **green wave** while memory is fine; it turns amber, then red, when memory or disk space is running low. Point at it (or Tab to it) for a short black box:

```
Local AI
7.6 GB of 32 GB
24 GB Free
Drive: 779 GB Free
```

The second line is this PC's RAM in use of its total, the third how much is free, and the last the free space on the CASEVAULT drive. The PC's RAM and the drive are read through Start-CaseVault.bat (the helper); without it, the browser only knows roughly how much RAM there is (*8 GB or more RAM*).

While the local AI has a model in memory, **click the icon** to unload it now instead of after 10 idle minutes. It loads again the next time it's needed.

**Why "no model loaded" with the AI set to Auto?** *Auto* is the setting that picks which model to use (Quick, Light or Thorough for this PC). Ollama only loads that model into memory when the AI is asked something (a check, a draft, Ask AI), and unloads it again after 10 minutes without use, to give the memory back. So between uses there is, correctly, no model loaded. The robot icon shows which model Auto will use.

## Drafts

The **Drafts** tab is where you write documents for the case: affidavits, subpoenas, memos, case summaries. Drafts are saved as Markdown files in `CaseVault-Data\cases\<case>\drafts\` on the SSD. They autosave like notes, with the same **Saved to SSD** indicator.

### Starting a draft

Give it a title and a type (Case summary, Affidavit, Subpoena, Memo, Other), then choose how to start:

- **Blank.**
- **Template.** Your agency's formats, stored in `CaseVault-Data\templates\` (see *Templates* below). Case details such as the case number are filled in for you.
- **Draft with AI.** Writes a first draft from this case's material (needs the AI model in the header, not **AI: Offline**).

Pick the start from the **Start from** dropdown; the template list shows when you choose Template.

The editor opens in the **Formatted** view (see *Formatted or Markdown* above); **Markdown** shows the text with its marks (`#` headings, `**bold**`, `1.` numbered paragraphs, `-` bullets).

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
- It works in the **Markdown** view (the checkbox hides in the Formatted view).
- It switches itself off when the header shows **AI: Offline** or **AI: Rules-only**. Untick it any time; CaseVault remembers the choice.

### Draft with AI

Click **Draft with AI** in the editor (or pick it when creating a draft) and choose:

- **Document type** (including **Supplemental Report**, **DEA 6**, **DEA 7**, **DEA 7a** and **DEA 202**) and optionally a **template** to follow.
- **What to use:** the case details (always), the timeline, the notes, and any attached documents. For long documents, CaseVault picks the passages most relevant to the draft.
- **Writing behavior:** how the AI writes. **DEA-6 style** is the default (third person, SYNOPSIS, numbered DETAILS paragraphs in time order, INDEXING). Others: plain narrative report, affidavit / formal legal, brief summary, and any you make (see *AI writing behavior*).
- **Library:** the examples to write like and the directives to follow (see *The Library*). Examples of the document type you chose are ticked for you, and so are your "always use" directives.
- **Reference** (optional): the **narcotics street values** and the **incident location and UCR codes**, for values and codes.
- The AI uses the Library and Reference only for **how** to write (format, headings, tone, wording) and for rules, values and codes, **never as facts of this case**; the names and events in your examples belong to other cases and are never copied. The draft's sources list what was used.
- **Header:** unticked (the default), the draft starts straight at the summary (SYNOPSIS). Tick it to start with a header block listing the case officer, the ASA or AUSA, the file and case numbers, the federal jacket number and the date.
- The case's **Report Fields** go along with the case details.
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

### Re-phrase and Review

- **Re-phrase:** select a sentence or paragraph and click **Re-phrase**. The AI rewrites it to DEA writing standards (third person, past tense, plain and exact, no opinion, facts and numbers unchanged). You see both side by side; **Replace the selection** puts it in, or close to keep yours.
- **Review:** checks the whole report. First the arithmetic, straight away: every total (money and weights, in a sentence or a table's Total row) is added up, for example *Line 3: says $3,000.00, but $1,200 + $1,500 = $2,700.00 (off by $300.00)*. Then the AI reads it for consistency: names, dates, times, exhibit numbers and amounts that don't match each other or the case details.

### Checking a draft

On an **Affidavit** draft, **Run consistency check** checks the draft against every document attached to the case, using the same checker as the Checks tab (rules, plus AI review when connected). Click a flag to see the sentence in the draft, and **Open draft** to go back and fix it. The draft's own exported copies are left out, so the draft is never compared with itself.

### Export

The buttons above a report, in order (v1.34): **Word View**, **PDF View**, **Draft with AI**, **Re-phrase**, **Review**, **Export**, **Save** and **Delete**. **Word View** shows the report as the Word document Export makes (read-only, fonts simplified), with **Save to Case Files** and **Save to PC** at the bottom.

**Export ▾** offers just three choices (v1.34):

- **Save to Case Files.** A Word file (.docx) is added to the case's Files tab. Recommended: it stays on the encrypted SSD.
- **Save to PC.** A Word file where you choose: Chrome/Edge ask where to save it, Firefox uses its normal download. Choose a folder on the SSD if you don't want a copy on the PC.
- **Save Template.** Saves this report as a template in **Vault → Templates** (put placeholders in it there).

The Word file keeps headings, paragraphs, bold and italic, bullet and numbered lists. Any `[CONFIRM: ...]` left in the text is highlighted yellow in Word so it can't be missed.

### Templates

A template is your document format (an affidavit, an arrest report, a subpoena…) with **placeholders** where the case details go. Manage them in **Vault → Templates**. Each one is a Markdown file in `CaseVault-Data\templates\` on the SSD.

**Adding a template: three ways**

1. **Import your agency's Word form** (easiest): **Import Word, .md or .txt…** and pick the `.docx`. CaseVault turns it into text: headings, bold/italic, lists and tables are kept; fonts, logos and exact spacing aren't (the draft exports to Word with CaseVault's plain layout). Check the text in the editor, put placeholders where case details go, and **Save template**.
   *Tip:* type the placeholders in Word before you import, for example `{{case.number}}` or `«case.number»`: both come through as `{{case.number}}`.
2. **New template**: paste or type the text and add placeholders.
3. **Add starter templates**: the Supplemental Report. It's an **example, not a legal form**; use it as a starting point and replace it with your agency's approved format. (The generic affidavit, subpoena, arrest report and case summary were removed in v1.28; a copy still marked *Generic example* is removed from the SSD, one you changed is kept. **Start an arrest report draft** uses your own arrest template, or a built-in outline when you have none.)

**Templates are Markdown (`.md`) files** on the SSD, but you don't need to work in Markdown: import a Word `.docx` to make one, and every draft made from a template exports as **Word (.docx)** (Export → *Save to Case Files* or *Save to PC*), and a template itself downloads as `.docx` from Vault → Templates.

**Using a template:** in **Vault → Templates** each one has **Use** (makes a report from it in the case you have open and opens it), **Download** (a Word .docx of the template), **Edit** and **Delete**. On the Reports tab, pick **Template** under *Start from*.

There's no required layout. Plain text works; to format it, `# ` at the start of a line makes a heading (the first heading is the template's name), `**bold**`, `*italic*`, `- ` a bullet, `1. ` a numbered line. **Edit / Delete** change or remove a template. Old `.doc` files: open them in Word and *Save As* `.docx` first.

**Placeholders.** Under the editor, **Placeholders** lists every one; click one to put it at the cursor. Upper and lower case don't matter.

| Placeholder | Becomes |
|---|---|
| `{{case.title}}`, `{{case.number}}`, `{{case.client}}`, `{{case.status}}`, `{{case.tags}}` | The case's details |
| `{{case.opened}}`, `{{case.closed}}` | The case's dates |
| `{{case.officer.name}}`, `{{case.officer.email}}`, `{{case.officer.phone}}` | The case officer, from **Contacts** on the Details tab |
| `{{case.prosecutor.title}}` (ASA or AUSA), `{{case.prosecutor.name}}`, `{{case.prosecutor.email}}`, `{{case.prosecutor.phone}}` | The prosecutor, from **Contacts** |
| `{{affiant.name}}`, `{{affiant.title}}`, `{{affiant.agency}}` | Your details from **Vault → My Profile** |
| `{{affiant.address}}` | Your address, on as many lines as you typed |
| `{{affiant.phone}}`, `{{affiant.email}}` | Your phone number and email |
| `{{today}}` / `{{today.iso}}` | Today, as *September 28, 2026* / *2026-09-28* |
| `{{arrest.name}}`, `{{arrest.dob}}`, `{{arrest.description}}` | The first arrestee from **Arrest details**: full name, date of birth (September 30, 2026 style), and "sex, race, height, weight, hair, eyes" |
| `{{arrest.charges}}` | The charges, one numbered line each: *1. statute — charge (level, degree; 2 counts)* |
| `{{arrest.date}}`, `{{arrest.time}}`, `{{arrest.location}}`, `{{arrest.bookingNumber}}`, `{{arrest.facility}}`, `{{arrest.miranda}}`… | Any arrest detail by its name (the editor's list has them all) |
| `{{arrest.2.name}}`, `{{arrest.2.charges}}`… | The second arrestee (and so on); `{{arrest.names}}` lists them all |
| `{{closure.disposition}}`, `{{closure.reason}}`, `{{closure.date}}`, `{{closure.note}}` | How the case was closed |
| `{{report.offense}}`, `{{report.ucr}}`, `{{report.date}}`, `{{report.evidence}}`, `{{report.narrative}}`… | Any entry on the **Draft** tab by its name (the editor's list has them all) |
| `{{confirm: badge number}}` | `[CONFIRM: badge number]` |

A placeholder with no value (for example a case without a client) becomes `[CONFIRM: case.client]`, so nothing missing slips through.

**My Profile.** Fill in your name, title, agency, address, phone and email once in **Vault → My Profile**. Changes save to `vault.json` on the SSD as soon as you leave a box, and **Save changes** saves them all at once and confirms it. They're used for new drafts from then on. Drafts you already made keep their text. Leave a box empty and templates show `[CONFIRM: affiant.phone]` (and so on) instead. The starter affidavit uses these placeholders; starter templates added before v1.8 don't, so add them to your own copy if you like.

## Backups

- The first time you connect each day, CaseVault copies `vault.json` (the case list and settings) to `CaseVault-Data\backups\vault-YYYY-MM-DD.json`. It keeps the newest 30. You can change that under **Vault** at the top right, and **Back up now** makes an extra copy.
- Those backups cover the *index*, not the cases themselves. To protect your cases, **regularly copy the whole `V:\CaseVault-Data` folder** to a second BitLocker-encrypted drive stored somewhere else.
- If `vault.json` is ever damaged, restore it from a backup: copy the newest `backups\vault-….json` over `CaseVault-Data\vault.json`. Then click **Vault → Rebuild case index**. CaseVault always rebuilds the list from the case folders when it opens, so the case list repairs itself.

## What is stored where

| Where | What |
|---|---|
| **SSD, `V:\CaseVault-Data\`** | All case data: details, notes, timelines, files (in their document folders), drafts, consistency checks and the text read from documents, mail logs, templates, the **Library** for the AI (`library\`), settings (including the AI writing behaviors and Quick links, (including the privacy-screen PIN hash, **My details**, mail settings and the PII watch list), backups, the outbound log (`logs\`) and, only if you ask, the online AI key (`secrets\`). Active cases are in `cases\<case>\`, archived cases in `archive\<case>\` (same contents). |
| **SSD, `W:\`** | The launcher, the helper, the AI engine and its models. No case data. |
| **The browser on this PC** | The CaseVault app files (so it opens offline), in Chrome/Edge a *pointer* to the vault folder so it can offer **Reconnect**, and display preferences (theme, zoom, brightness, time format, the AI profile). No case data. (Which operations are folded in the case list is kept in `vault.json` on the SSD, since v1.28.) |
| **GitHub** | Only the app's code. Case data can never be committed; the repository blocks it. |
| **The internet** | Nothing, unless you go online. Normally CaseVault only talks to the AI engine (and, in Firefox, the helper) on this same computer, at `127.0.0.1`. When you go online for research or drafting, reviewed and redacted text goes to `api.anthropic.com` (API), or you paste it into claude.ai yourself. Department mail is sent by Outlook, not by CaseVault. |

To make a PC forget the vault folder, open **Vault → Disconnect**.

### What deleting leaves behind

- **Delete a file, draft or case:** it's removed from `CaseVault-Data`; a deleted case also leaves the older `vault.json` copies in `backups\` and its Ask AI chats. Nothing is kept in a trash or a log of what was in it. The **outbound log** (`logs\`) keeps a line for each online AI request (when, which service, a fingerprint of the text), not the text itself.
- **On the SSD itself:** like any file deleted in Windows, the space is marked free, not overwritten, and an SSD decides on its own when to erase it. No app can guarantee it's gone. What protects it is **BitLocker** on V:: everything left in that free space is encrypted, and unreadable without your BitLocker password. To retire the SSD completely, use **Emergency Purge**, then format the drive with BitLocker turned on (or have IT wipe it).
- **The AI engine** (`W:\logs\ollama.log`) logs that a request was made and how long it took, not what was asked.
- **The PC:** CaseVault keeps no case data there (see the table above). Windows itself may: a file you opened in Word or Acrobat can leave a recent-files entry or a temporary copy, and a file you downloaded or exported sits in the PC's Downloads folder until you delete it.

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
| I forgot the privacy-screen PIN | Reload the page (F5). The screen is gone, and you'll be asked to reconnect in Chrome/Edge. Then set a new PIN under Vault → Privacy screen. |
| No grey AI suggestions appear | The header must show the AI model (not **AI: Offline**), and **AI suggestions** must be ticked. Suggestions only appear when the cursor is at the end of a line. |
| *Draft with AI* is greyed out | Start `W:\Start-CaseVault.bat` so the AI engine runs, then click the AI pill → **Check again**. |
| A check says a file was *Skipped* | It couldn't be read (damaged, password-protected, or an unsupported type). Save it as PDF or DOCX and attach it again. |
| *Drive not connected* | Plug in the SSD, unlock V: with the BitLocker password, then click **Reconnect**. |
| Reconnect keeps failing | The drive letter probably changed. Click **Choose folder…** and pick `CaseVault-Data` (or the drive's root). |
| *No vault found in "…"* | You picked a folder that isn't the vault. Choose the CASEVAULT drive or `CaseVault-Data`. Only click **Create vault here** for a brand-new vault. |
| *This vault was saved by a newer version* | Update the app (reload the installed app while online, or refresh the SSD copy). |
| A case disappeared from the list | Click **Vault → Rebuild case index**. If its folder is still in `cases\`, it comes back. |
| *Not saved — reconnect SSD* | See **Saving** above. Keep the window open, reconnect, and wait for green. |

## When Ollama isn't running

If Ollama isn't running, CaseVault can use a small **in-browser AI model** instead, if one is on the SSD and CaseVault was opened through `W:\Start-CaseVault.bat`. The header then shows **AI: In-browser · …**. The first AI request loads the model from the SSD, with a progress message, which can take a minute. See [AI-SETUP.md](AI-SETUP.md), section 8.

Without Ollama or an in-browser model, the consistency checker uses its rule-based layer only, and Draft with AI and suggestions are unavailable.

**Not built yet:** using the in-browser AI from the hosted/installed app *without* the launcher (it needs a way to read the models from W: directly).
