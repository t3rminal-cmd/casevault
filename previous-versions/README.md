# CaseVault: Previous Versions

What each earlier version of CaseVault added or changed, newest first. The main [README](../README.md) describes only the current version.

The day-to-day "What's new" notes for each version are also in [docs/USING-CASEVAULT.md](../docs/USING-CASEVAULT.md).

## Features (v1.107)

- **Backup chip never clips:** shorter words (*Backed Up*, *Backup: 9d*, *No Backup*; the full sentence is in its tooltip), and no chip in the banner is ever narrower than its words
- **Timeline circles glow green for the open case:** on a case's Details tab, the circles of that case number's events glow green (the others of the Mission stay blue); the case number is named next to *Timeline* as a key
- **Put Exhibits in Date Order:** Draft → Evidence → **Put in Date Order**. Cases sharing one federal jacket number share one exhibit sequence; a case entered later but dated earlier now gets the first numbers. The exhibits are numbered again by each case's Date of Occurrence (its opened date when empty), shown first as *old → new*, and their photos and PDFs are renamed to match. Reports already sent keep their numbers

## Features (v1.106)

- **Recently Deleted.** Delete Case now keeps the case for 30 days in ⋮ → Vault → **Recently Deleted**, with **Restore** (it goes back where it was, Mission and all) and **Delete Now**. After 30 days it is removed from the SSD for good
- **Restore cases from a full backup.** ⋮ → Vault → Backups → **Restore Cases…**: pick a `CaseVault-Backup-<date>` folder (on the backup drive or `C:\CaseVault-Backups`), tick the cases to bring back. A case that is in the vault now goes to Recently Deleted first, so nothing is lost
- **Search Inside Cases.** Type in the case-list search box and press Enter (or click **Search Inside Cases**): it also looks in notes, the timeline, reports, the Draft form, arrest details, suspects and contacts, and file names, and opens the right tab
- **Add Follow-up** (Case actions, Details tab): waiting on a lab, the DA or another agency? Puts *Follow up: …* on the Timeline as a deadline
- **Stronger PIN lock** (the privacy screen's PIN is now stored with a slow PBKDF2 hash; an older PIN is upgraded the next time it unlocks) and **copied text is cleared from the clipboard** when the privacy screen comes on
- **Look:** one colour per status everywhere (Open blue, Closed slate grey, Archived purple, also on the sidebar's left edge), banner chips the same width, empty lists with an icon and a hint, every section heading in capitals, darker hint text, and a clear blue outline on whatever the keyboard is on

## Features (v1.105)

- **No more Pending.** Cases are Open, Closed or Archived, and Missions Open or Closed. The Pending option, its hourglass icon, the Pending count in the banner and the Pending filter are gone. Anything that was Pending opens as Open (its follow-up deadlines stay on the Timeline, and the case history notes it). The Draft's *Court Date: Pending* box is unchanged

## Features (v1.104)

- **Attach a PDF to an exhibit, as well as photos.** On the Draft tab, each exhibit's tile now reads **Add Photos or PDF** (Additional Exhibits too). A PDF (a lab report, a receipt, a scanned form) is saved in the case's exhibit folder like a photo, gets the next letter (Exhibit 1b), and its tile shows the first page with a red **PDF** badge; click it to read it. In the report, every page of the PDF goes into the Exhibit Attachments, captioned with the exhibit, its label and the page (*Exhibit 1b, ... - Document: Lab report (page 2 of 3)*)

## Features (v1.103)

- **Mission timeline on the home page: the slim line with small circles.** Click a Mission folder and its timeline is the same line as on a case's Details tab: a small circle for each event of every case number (events close together share one circle with their count), red for an overdue deadline, and a red Today mark. It fits the page, with no sideways scrolling. Point at a circle for the date, title, note and case number; click it to open that case's Timeline tab. (This replaces the vertical list from v1.102.)
- **Back up to C:\CaseVault-Backups.** In Firefox, **Back Up Everything** → **Add Backup Folder** now takes a folder on the PC's own drive as well as a shared folder on another PC, and `C:\CaseVault-Backups` is filled in: click **Add** (the folder is made if needed). Running CaseVault on the Beelink, that is the Beelink's C: drive. Its BitLocker state is shown, a folder on the SSD itself is refused, and the backups go straight into the folder (no CaseVault-Backups inside CaseVault-Backups). See [docs/BACKUP-TO-ANOTHER-PC.md](docs/BACKUP-TO-ANOTHER-PC.md)
- **CaseVault helper 1.15**

## Features (v1.102)

- **Back up to another PC at home.** In Firefox, **Back Up Everything** has an **Add Network Folder** button: type a shared folder such as `\\BEELINK\CaseVault-Backups` and the whole vault is copied there over your home network, then checked file by file. The cases stay on the SSD. The first backup to a folder asks you to confirm that PC is encrypted and the folder is shared with you only; a folder that can't be reached is greyed out; **Remove** takes it off the list. In Chrome or Edge, map the folder to a drive letter and pick it. Setup steps for the other PC: [docs/BACKUP-TO-ANOTHER-PC.md](docs/BACKUP-TO-ANOTHER-PC.md)
- **Mission timeline on the home page is now vertical.** Click a Mission folder and its timeline reads top to bottom like a case's Timeline tab: month headings, a date box, a dot on the line, a card for each event, and a red Today line. No more sideways scrolling; click an event to open it on its case's Timeline tab
- **No underline on mouse-over.** Links turn blue when the mouse is over them, without the underline
- **CaseVault helper 1.14**

## Features (v1.101)

- **Draft: Next Missing.** After **Save Changes**, a red **Next Missing (N)** button takes you to each blank field in turn, opening a folded part on the way. The save message is shorter: *Saved. 64 fields still blank (outlined in red).*
- **General Files: Age, and sorting.** A new **Age** column (*Today*, *5 days*, *2 months*, *2 years*) next to Opened. Click **Case Number**, **Subject Name**, **Opened** or **Age** to sort by it (again to reverse); Age puts the oldest case first
- **Sidebar order.** The new button next to Hide (top of the sidebar) lists cases by case number, oldest opened first, or newest opened first; the choice is remembered on this PC
- **Tidier INDEPENDENT CASES header.** The red bell is a badge on the folder instead of on top of the name, the count keeps its distance, and the line under it reads *4 cases*
- **The "No full backup yet" pop-up shows at most once a day**; the red chip in the banner still shows until you back up

## Features (v1.100)

- **Sidebar: when each case was opened.** Under every case number's Subject Name, a small line shows the day it was opened and how long ago (*Oct 03, 2026 · 5d*, *Jul 10, 2026 · 2mo*, *Jul 30, 2024 · 2y*). Point at it for the full date and the number of days
- **Draft: what's missing is outlined in red.** After **Save Changes**, every part without its green check outlines its blank fields in red (or its empty list, or *No evidence yet*), and the save message says how many. Each outline goes as soon as the field is filled; unticking a part that doesn't apply clears its outlines

## Features (v1.99)

- **The backup reminder sits with Overdue.** On the home page banner, the full-backup chip is now in the same row as the Open, Pending, Closed, Archived and Overdue counts, right after Overdue: **No Backup** or **Backup 9d Ago** in red when a backup is due, **Backed Up Today** when it isn't. **Not Encrypted** joins it there when the SSD has no BitLocker. Click either for ⋮ → Vault → Backups

## Features (v1.98)

- **Drive encryption checks.** With the helper (Firefox), CaseVault asks Windows whether the CASEVAULT drive has BitLocker. If it doesn't, a red **SSD not encrypted** chip sits on the home page and a warning shows at startup. **Back Up Everything** shows each drive's encryption and asks before copying every case to a drive without BitLocker. ⋮ → Vault → Backups shows the SSD's state. Helper **1.13**
- **[docs/SECURITY.md](docs/SECURITY.md)**: what protects your cases and the code, and a checklist of GitHub settings to turn on (two-factor sign-in, branch protection, secret scanning)
- **Safer publishing.** The GitHub Actions that check and publish CaseVault are pinned to exact versions (Dependabot proposes updates), and nothing is published until the new **browser tests** pass: the whole app driven in Chromium with made-up cases (`tests/e2e/`)
- **Tidier code.** The Case Overview, Timeline tab and Files tab moved out of `js/app.js` into their own files; nothing changes on screen

## Features (v1.97)

- **Subject Names read "LAST, First" everywhere they're listed**: the sidebar, General Files, Mission folders, Needs Attention and the case header ("John Doe" and "doe, john" both show as **DOE, John**). The Subject Name box keeps what you typed; names that aren't one person's ("Unknown Offender", "State v. Doe", a group) show as typed. Search finds either form
- **Timeline on the Details tab: events close together no longer overlap.** Events on the same day, or too close to tell apart, share one marker with their count; point at it to see each one

## Features (v1.96)

- **Deconfliction checks in date order**: the oldest check is first and checks with no date go last. Change a date and the check moves to its place once you leave the list, so a card doesn't jump while you're typing. A new check opens at its place

## Features (v1.95)

- **Offense Classification always matches a charge's Statute Description, word for word**, including drafts saved before: when a draft opens, when it's saved and on the PDF, wording that isn't one of the charges' descriptions becomes the first charge's. Pick another charge's wording from the box's arrow; typed wording that isn't a charge's goes back when you leave the box (a note says why). With the Charges list ticked off, the box stays as typed
- Adding, removing, picking or retyping a charge keeps Offense Classification in step

## Features (v1.94)

- **Offender Vehicle(s):** each offender on the Draft tab lists their vehicles, one card each: Year, Make, Model, Color, License Plate, Plate State, VIN and Registered Owner, with **Impound**, **Tow** and **DNA** as click boxes (one at a time). Add Another Vehicle and the trash can add and remove them; No Vehicle still hides them
- The duplicate boxes are gone: the offender's single Vehicle / VIN / Plates boxes and the separate Vehicles list in the Officer's Report. What was in them moves to the offender's vehicles by itself (a plate like "IL AB12345" splits into state and number; the same car in both places is kept once)
- PDF: each vehicle prints under its offender (*Vehicle 1: 2015 Honda Accord, Black · Plate IL AB12345 · VIN … · Impounded*); the separate "Vehicle(s) Impounded / Towed" block is gone

## Features (v1.93)

- **State of Illinois as victim: Relation Code 024**, filled in by itself (you can change it), and on the PDF: *State of Illinois · Relation Code: 024 · Officer Name*
- **Offense Classification uses the exact wording of the Statute Description:** picking (or typing) the first charge fills it, an IUCR code no longer replaces it, and its arrow lists the Statute Descriptions of every charge entered. Wording you typed yourself is never overwritten
- **Officer's Report green check:** a list still ticked in but empty (for example no Police Personnel added) no longer counts as filled in; tick it off when it doesn't apply
- **Suspects on the Details tab are kept in order:** Primary first, then Secondary, then Other; changing a role moves the card, and a new suspect goes into its role's place
- **Add From Suspects (Draft → Offenders) lets you pick which suspects go into the report:** the Primary ones start ticked, suspects already in the report are marked, and Cancel adds nothing

## Features (v1.92)

- **Court Date → Pending** no longer unticks the Court Date line in Firefox. The row held a tick box inside another tick box's label, so Firefox clicked both; it is now built so each tick box only answers to itself
- **CB Number can be DNA** (Does Not Apply): on each offender on the Draft tab, and on the Arrest tab's CB # (and IR #), from the arrow on the box, like the IR, FBI and IDOC Numbers

## Features (v1.91)

- **CaseVault is offline only.** The optional online AI (Claude, Gemini, OpenRouter: the Online button, the online page and the API keys) is gone. The page's security policy now allows nothing but the AI engine on this PC (`127.0.0.1:11434`)
- **No in-browser AI fallback (WebLLM).** The local AI engine (Ollama, started by `Start-CaseVault.bat`) does all the AI work; when it isn't running, the Consistency Checker still runs its rule-based checks
- An online AI key saved on the SSD by an older version (`CaseVault-Data\secrets`) is deleted the first time v1.91 opens the vault, with a one-time message; the old online and in-browser settings are dropped
- The header's **Offline** badge stays, as a reminder that nothing leaves the PC
- Department mail keeps its review screen (recipients, attachments, personal details) and the Outbound Log
- **Helper 1.12:** no longer serves in-browser models (`/webllm/`); `W:\webllm` and `W:\Get-WebLLM-Model.bat` can be deleted

## Features (v1.90)

- **Back up before Power Off:** when the vault hasn't had a full backup in over a week (or ever), Power Off asks first: **Back Up First**, **Power Off Anyway** or Cancel
- **Undo after Clear All** on the Draft, as after Send to Files: the toast's Undo puts the form back
- **Change a Case History note:** the pencil opens the note's date and words in place (Enter saves, Esc cancels); × still deletes it
- **Search finds Case History notes:** the case list search (Ctrl+K) matches the words in a case's notes, e.g. "migrated"
- README shows the current version only; the earlier versions are in [previous-versions/](README.md)

## Features (v1.89)

- Send to Files clears the Draft by itself once the PDF is saved; the toast has an Undo button that brings the Draft back
- The floating Draft bar (Send to Files, PDF View...) now sits right under the top toolbar, with no gap
- Case History: the date and the entry have their own columns, so nothing runs together. "Opened as Open" now reads "Added to CaseVault (Open)", and when the Opened date on the Details tab is earlier there is a "Case opened" row on that date
- Case History: **Add Note** with its own date (for example "Case started on paper; migrated to CaseVault"); notes sort by their date, show on the Case Summary PDF, and can be deleted with ×
- Details: the Case Officer name in Contacts uses the same font size as the other boxes
- Files preview of a PDF uses CaseVault's own square viewer (zoom % and page boxes square, no rounded browser controls)
- Keyboard shortcuts: every key box is the same width and height
- Clean-up: about 60 unused style rules and an unused date function removed

## Features (v1.88)

- Quick Links and the CLOSED FILES / ARCHIVED area: one fixed height, five Quick Links tiles high; the drag bars and padlocks are gone
- CLOSED FILES and ARCHIVED scroll as one list, and when the scrolling stops the top card is shown whole (never cut off at the top); the headings scroll with their lists

## Features (v1.87)

- **Back Up Everything in Firefox** (needs helper 1.11): CaseVault lists the other drives (not the SSD's own partitions or the Windows drive), the helper copies the whole CaseVault-Data folder to `<drive>\CaseVault-Backups\CaseVault-Backup-<date>` and checks every file's SHA-256 against the original, in the background with a progress count; the banner then shows the backup as checked. With an older helper the File Explorer steps still show
- Helper 1.11: new `backup-drives`, `backup-start` and `backup-status` calls; a backup can only go to one of the drives it lists

## Features (v1.86)

- Supplementary Report PDF, Officer's Report:
  - **Victim**: a State of Illinois victim and the Officer Name on one line
  - **Narcotics Recovered (Total Weight & Value)**: the narcotic, the amount, then Street Value and Purchase Price under each other
  - **Pre-Recorded Funds**: a table with QTY (two digits), Denomination ($20.00) and each Serial Number on its own line, then Recovered or Not Recovered
- The Officer's Report has no IR Number line any more: the IR Number is in each offender's info (one typed there before goes to the first offender without one)
- Submission and Approval: untick **Secondary Reporting Officer** when there is none; the name, star and signature boxes then come off the PDF

## Features (v1.85)

- **Back Up Everything** (⋮ → Vault → Backups): copies the whole CaseVault-Data folder to a second drive and checks every file byte for byte (Chrome or Edge; in Firefox it shows the File Explorer steps and records the date). The banner shows when the last full backup was, red after 7 days, and a reminder appears at start-up
- Restore a vault.json backup from the Backups list (the current one is backed up first)
- Start-up checks: today's vault.json backup, the last full backup, and free space on the SSD (Firefox)
- A Mission is Closed only when its cases are: **Close Mission** is on the Mission page (each open case gets a disposition), with **Reopen Mission** when it is closed; the Edit form refuses Closed while a case is open
- The sidebar's GENERAL FILES folder is now **INDEPENDENT CASES** (the cases not in a Mission); General Files is still the page with every case
- Pending and Inactive explained where you choose them; the Closed date on the Details tab is filled in by Close Case, not typed
- Delete Case asks twice; the last question comes with a skull and crossbones
- **Report a Problem** (⋮ menu): the app version, browser and recent errors with case numbers, names and Missions taken out, saved to the SSD or copied, to send with Contact Dev
- **Case History** on the Details tab: each status change, closing, reopening, archiving and Mission move, with the date and time
- **Case Summary** (Case Actions): one PDF page for a supervisor with the case, arrestees and charges, exhibits, timeline and history; Save PDF to Case puts it in Files
- Keyboard shortcuts: Ctrl+K search, N new case, ? the list (also in the ⋮ menu)
- **Department letterhead**: a square for the department logo (click to add it) and the Department Header beside it, at the top of the Draft, Arrest and Link Chart tabs and across the top of their PDFs; one letterhead for every case, kept on the SSD
- Templates, the Checks tab and the Document Anonymizer are marked Beta
- Removed: the second Restore button on archived cases and Close Mission on each case's Details tab

## Features (v1.84)

- CLOSED FILES and ARCHIVED always sit at the bottom of the sidebar; drag the bar above them to make that area taller or shorter, and lock it with the padlock (double-click the bar to reset)
- Quick Links: drag the bar above them to change their height, and lock it
- Closing needs a disposition; closing by arrest needs the arrest report (an arrestee and at least one charge) first, with a button to open the Arrest details tab
- Archiving needs a reason: EXPIRED, NOLLE PROSEQUI, PROSECUTION, or Other with the reason written in; the reason shows on the archived case
- After closing, the message has Undo for a few seconds
- Closing the last open case of a Mission asks whether to close the Mission too; reopening a case of a closed Mission asks whether to reopen the Mission
- A closed case stays in its Mission's folder, greyed with a padlock, under the open ones; in CLOSED FILES it is listed under the Mission's own name
- The Status drop-down offers Open and Pending; closing and archiving use their buttons
- Banner: glass status boxes with a colour edge, a red Overdue count, and each count opens General Files showing just those cases

## Features (v1.83)

- CLOSED FILES and ARCHIVED in the sidebar look like MISSION FILES and GENERAL FILES (a card with the folder icon, the name, a line under it, the count and the arrow); the CLOSED FILES count is the number of closed cases, as on the banner
- GENERAL FILES has a + for a new case
- Recently Updated: every status box is the same width
- Reopening a case shows the closing date written out

## Features (v1.82)

- Sidebar folders stay open or folded until you click them (no longer reset when you go to another page)
- A Mission's page has All Files: every file on the SSD for that Mission (each case number's Files and the Mission Folder), newest first; click one to open it
- Notifications have a Time; an offender's No Vehicle box hides Vehicle, VIN and Plates (and leaves them off the PDF)
- Pre-Recorded Funds: "Electronic Funds × 2" no longer runs into the numbers
- Timeline: Clear empties everything, an edit in progress too

## Features (v1.81)

- Supplementary Report PDF laid out like the paper report: an offender sheet each (custody, name and A.K.A., description, DOB, eyes, hair, tattoos, clothing, residence, phone, IR and CB, vehicle, VIN, plates), Police Personnel as a Name / Star / Unit / Role table, each charge as its statute over its description, and each exhibit with its inventory number, type and description
- Status and How Cleared on the PDF are square boxes with an X, like Update Information
- Offenders have Custody (In Custody / Not in Custody), Residence, CB Number, Vehicle, VIN and Plates
- Subject Data suggests the suspects and offenders already in the Mission's cases and fills a subject in from them; Add From Reports adds them all
- An Other folder in each Mission Folder, next to Vehicle List

## Features (v1.80)

- Mission Folder → Subject Data opens a demographics sheet per subject (name, alias, date of birth, description, record numbers, address, notes) with a photo on the right; Add Subject for as many as needed
- Files: the row button is a pencil (Rename or Move) and the dialog's button says Save; renaming a file of a case number with hyphens no longer doubles the case number
- Dates have two-digit days everywhere ("October 04, 2026") and sit on the right in tables
- Pre-Recorded Funds: Electronic Funds as a denomination (with transaction / reference numbers)

## Features (v1.79)

- Files tab: the Document column shows each file's icon (its type in the hover box); files can be arranged in every view, All documents included; a renamed file keeps its place
- Renaming "3b" to "Exhibit 3b" shows "Exhibit 3b" (only "Type - Description" names drop the type)
- Timeline: a wider date square (the time never clips) and even spacing between the date, the dot and the event
- Drop-down lists fit the window when it is made narrower
- Gang Affiliations, Persons Present, Police Personnel, Vehicles and Notifications each in a grey box

## Features (v1.78)

- Operations are called Missions everywhere on screen (New Mission, Mission Number, Mission Folder, Mission Plans…); nothing on the SSD is renamed
- MISSION FILES in the sidebar holds every Mission, like GENERAL FILES, with a + to make a new Mission; New Mission is also beside All Missions on the home page
- A Mission's page shows its Timeline (all its case numbers), between Files and the Mission Folder
- Timeline dots sit exactly on the centre of the line

## Features (v1.77)

- The sidebar folder names are in capitals: MISSION FILES (closed cases of Operations still going on), GENERAL FILES, CLOSED FILES and ARCHIVED

## Features (v1.76)

- DNA (Does Not Apply) can be picked for the Federal Jacket Number and for IR, FBI and IDOC Numbers (suspects, offenders and the Officer's Report)
- Timeline markers are all circles
- Draft: the Verified and Updated ticks share one grey box; a part's checkbox explains itself in a float box on hover (in the report, left out, or hidden on screen); "Not in the report" has its own column next to the green check
- Files tab: names read "2026-EX-100 | Purchase" (the Document column gives the type); Updated shows the time under the date; the text matches the rest of CaseVault; the files of a folder can be arranged (Arrange, above the table); the folder list's Arrange button is boxed like Discovery
- Adding files: no cut-off hint in the file-name box, and the boxes no longer move while you type

## Features (v1.75)

- The shield folder icons are used everywhere: sidebar, case pages, Files tab, Operation folders, Move and New Folder buttons. Operations are blue, General Files and ordinary folders are purple, Other Files are green, Closed is a muted green and Archived is grey

## Features (v1.74)

- Needs Attention folds into one slim bar (with how many items and how many overdue); it stays folded until opened
- OPERATIONS is now MISSION FILES; MISSION FILES, GENERAL FILES and OTHER FILES are the same width; new folder icons (blue, purple, green) and each section's button in its colour; New Folder moved to the OTHER FILES header
- Quick Links: REFERENCE in capitals like OSINT and LEO
- Operation page: plain FILES and OPERATION FOLDER headers, the explanations small under each section
- Everything clickable shows it on hover (links underline, buttons and tiles take the accent colour)
- Link Chart: the narcotics and money badges use the app's cannabis and money icons (in the PDF too)

## Features (v1.73)

- The case list and Quick Links bar in a cool slate shade with white, shadowed buttons that lift on hover (light and dark)
- Timeline redesigned: a rail with month headings, a date chip per entry, coloured markers (event, deadline, overdue, done), a Today line, a summary strip (Events, Open Deadlines, Overdue, Next Due) and All / Upcoming / Deadlines / Past filters
- Operation Folder as folder icons (files and Add Files show when a folder is opened); Running Vehicle List is now Vehicle List, with a card per vehicle (the Draft's vehicle fields plus Registered Owner and Address) and its photo on the right
- Draft → Vehicles: Registered Owner and Registered Owner Address

## Features (v1.72)

- OTHER FILES shows its five folders (USPIS Files, DEA Files, INET Files, Training, Other) as folder icons like Operations and General Files, plus New Folder; click one to open its files below, click again (or Close) to close it

## Features (v1.71)

- Back to Top always shown (an up caret ^) beside Ask AI
- Every page starts left, next to the case list, at the same width: nothing jumps going from a folder to a case
- OTHER FILES folders: USPIS Files, DEA Files, INET Files, Training, Other, plus New Folder (and Remove Folder when empty); each tab shows what the folder is for
- Overview sections (Operations, General Files, Other Files, Recently Updated) in matching panels with the same header; Recently Updated as even columns in smaller, regular type
- Draft: the green bar against the checkbox of a finished part is gone (the green check on the right stays)

## Features (v1.70)

- Overview headings OPERATIONS, GENERAL FILES and OTHER FILES without folder icons
- Files tab: Additional Exhibit photos show as "Exhibit 1a"; no eye button (click the name to open)
- Back to Top arrow beside Ask AI, bottom right, once a page is scrolled down

## Features (v1.69)

- Quick Links footer on every page, like the case list; Operation Folder folders are tabs like a case's tabs; sidebar case numbers and archive sub-folders the size of the folder names
- One field look everywhere (the Draft's): grey box, small grey heading inside, entry at the same size, on every page and popup
- Date boxes predict the month as you type ("sep" → September, Tab takes it; "September 30" + Tab adds the year)
- Suspects and Offenders have the same fields (the Offender also has Clothing): Hair Style (new), Gender Identity, Veteran, Relation Code, IR / FBI / IDOC Numbers, Moniker; Add From Suspects copies them
- Draft: "Hidden on screen" beside the checkbox; DNA for Arrest Unit and If Residence, Where; Pending for Court Branch and Court Date; Adderall in Narcotic Type; the Search Warrant / Subpoena GJ label is never cut off
- Checks: a photo is read only for the words written in it (unsure OCR is dropped) and is never named by its file name to the AI, so camera names and noise no longer cause false flags; Power Off tooltip shortened

## Features (v1.68)

- Draft → Evidence: Additional Exhibits (photographs or text-message screenshots not tied to an inventory number), numbered on their own (Additional Exhibit 1; photos 1a, 1b) with Next Additional No., Reset to 1 and Automatic; they appear in the report, its exhibit list and the photo pages
- Text Message PDF: a portrait PDF of an Additional Exhibit's screenshots, two to a page, each labelled with its exhibit number, saved under Files (Other Exhibits)
- Power Off button next to the SSD icon: saves, then closes CaseVault, the browser window, the helper and the AI engine, and locks and ejects V: and W: (helper 1.10.0)
- Overview: OPERATIONS, GENERAL FILES and a new OTHER FILES box (files not tied to any case); each Operation has an Operation Folder (Subpoenas, Affidavits, Operation Plans, Maps, Subject Data, Running Vehicle List)
- Draft green checks: an unticked part or line counts as done, phone numbers you didn't add don't count against it, and the checks line up in one column beside the fold arrows; How Cleared has 6 - On Going
- Files: the date column is Updated (the last time the file changed); street value chart with a colour icon per drug category; theme check of every page and popup

- Statute of limitations for narcotic charges: 3 years from the Date of Occurrence (Draft; else the arrest date); 5 days before, Needs Attention shows "Warning: Statute of Limitations Expiring" with a live count-down, the case gets a red border and a reminder pops up once
- Archived sub-folders EXPIRED, NOLLE PROSEQUI and PROSECUTION: picked when archiving (EXPIRED is preselected once the statute has passed) and changeable on the archived case
- Suspects: a Not Identified box; Draft parts show a green check once every field is filled (seen folded too)
- Search Warrant Number has twice the room (long numbers were cut off); the footer keeps its height on every tab; more space under the greeting

- Quick Links footer: Reference / OSINT / LEO stacked under the Quick Links name on the left; Charges is one button that shows Federal and State when clicked
- Overview: the deadline reminder is gone from the banner and from beside Needs Attention; due labels in Title Case (Due Today, Due Tomorrow, In 3 Days, 2 Days Overdue)

- Quick Links footer is a little taller: four rows of links, so every OSINT link shows at once; the same height on every tab

- Case tabs (Details, Arrest, Timeline, Draft, Reports, Files, Link Chart, Mail, Checks) look like the Options tabs: boxes side by side, each with its own icon; the open tab is white with a blue line along its top

- Quick Links are a footer on the Overview: a bar under the page from the case list to the right edge of the screen, with the tabs on top and the links in five equal columns (two rows show; more scroll); Charges shows its Federal and State choices in the button

- Quick Links pinned at the bottom of the Overview; street value chart with its own Form column and the same columns for every category; popups redesigned (title bar, sections, hints, buttons that stay in view)
- Link Chart: one line per direction, never two arrow heads on one line; two lines between the same cards run side by side without crossing (narcotics one way, money back); Turn Around and Add Return Line; old two-way arrows become two lines

- Overview: a smaller banner with the Open, Pending, Closed and Archived counts in it; one row of same-size quick actions (New Case, Draft, Discovery, Link Chart, Ask AI, Reference, Library, Vault), where Draft, Discovery and Link Chart ask which case; a Needs Attention list of deadlines overdue or due within a week, soonest first, each opening that case's Timeline

- Sidebar: Operations show the Operation Number on top and the name below (also on the Overview folders); a case with a deadline coming up, and its Operation, get a thin red border; the hide button is now an incognito icon and the top icons are all the same size
- A full sidebar scrolls inside its own list (thin scrollbar); the top icons stay put and Closed and Archived stay at the bottom
- Sharper screen: no blur behind the header, and the big Ask AI window sits on whole pixels

- Link Chart: lines turn at right angles and leave from a card's side, top or bottom (not across photos); two lines between the same two cards sit one above the other (narcotics one way, money back); Link Cards the other way round adds the return line; each connection is a folded card with an eye to show or hide its line; Save PDF to Case puts the chart in Files and under Reports, and Send Back to Link Chart (from Reports or Files) brings it back to change
- Every form starts minimized (Case Overview, Draft, Arrest details, Vault); the parts you open are remembered
- Discovery: step-by-step directions to burn a CD or DVD in Windows
- Checks tab redesigned; Ask AI suggestions in four same-size boxes
- Vault → Outbound Log: see its size and delete older months or all of it

- Link Chart: the mouse wheel zooms around the pointer and dragging the background moves around; the chart sits on small faint olive-green grid squares, with a Snap switch for Free layout
- Link Chart platforms: Facebook and Instagram separately, plus Grindr, Cash App, Venmo, Zelle, Apple Pay, Coinbase and MoonPay, each with its own picture (Dark Web as before)
- Link Chart connections can carry Money or Narcotics: a small round $ or capsule badge on the line, green or orange, and the arrow shows who sends it

- Colour icons everywhere (Ask AI window, Options, the Overview banner, Suspects, Case Actions, quick links, arrows, plus/minus, close, warnings and more); the blue and red buttons are tinted with a coloured border, so their icons sit on them cleanly
- Options and the Ask AI window redesigned; grey field boxes have a thin border so they don't run together
- No drive name under the logo (the SSD square in the header shows where the data is saved); the Updater (1.2.1) has no logo on the right
- No X on boxes that already have Done, Close or Cancel
- Quick links: Illinois Compiled Statutes, Chicago Cop, NW3C (LEO); ZetX, Bandwidth, TextNow, Blockchain Explorer, TRM Labs (OSINT); Geotime LIVE address filled in
- Discovery: Where To can be a CD or DVD drive (a disc Windows set up "Like a USB flash drive")

- Link Chart: Primary (was Subject); Tree or Free layout (drag cards); Move Left / Right; cards per row with a readability line for the portrait page; Link Cards (click two cards to link with an arrow, again to unlink) with arrows to, from or both ways; zoom and Fit; Clear Chart; no cut-off words; phone format; saved PDFs carry the chart so Files → Link Charts can open it back in the tab

- Discovery receipt: a printable PDF made with each production (option on by default). It lists who turned it over and to whom, every item with its Bates numbers and SHA-256, blank Date and Time of Receipt boxes, an acknowledgment that the items received are accurate and complete, and wet-signature lines for the recipient, the officer and a witness. It goes to this PC's Downloads folder, and a copy stays with the case
- Discovery popups redesigned: header with icon, options in three boxes, summary tiles in Ready to Copy and Done, Receipt button on each earlier production
- Closed folder: closed cases of an Operation that is still going are listed by case number under one "Operation Files" folder, not under the Operation's name

- Draft tab: Court Branch and Court Date on one line; Search Warrant or Subpoena number, ASA or AUSA, Judge or Magistrate on one line, each label a switch (only the chosen one goes in the report); Pre-Recorded Funds as one line per denomination (quantity and serial numbers, added in a small box) with one Recovered / Not Recovered; evidence photo labels on one line; no Extra Copies box (the PDF's signature table is rearranged)
- New Report types: Case Summary, Affidavits, Other; no sample text in the Title
- Arrest Report PDF: "2nd Arresting Officer" lines up with the 1st, with room before the Approving Supervisor
- Mail tab and the Vault in grey boxes; every Vault section, LEO Partners, Suspects, Contacts and Deconfliction fold away with ▾ / ▸
- LEO Partners shows only the agencies working the case (Show All Agencies brings the rest back)
- Quick links: Geotime LIVE (OSINT, add your agency's address), and Chicago HIDTA's submission form, fixed in LEO

## Features (v1.53)

- Square drop-down lists in every browser: CaseVault draws its own list for every drop-down (`js/select.js`), so no Windows/Edge rounded pop-up appears; the browser's typing history and suggestion pop-ups stay off as before
- More colour icons drawn in the same style (search, hide, offline, AI robot, PDF and Word, review, export, save, pencil, the Files folders, camera, printer, clock…), on white tiles so they stand out; filled buttons show them on a small white square; the Overview banner is unchanged
- The deadline bell is red; the page is a softer off-white; the header buttons show their state as a coloured line under them

## Features (v1.52)

- **Link Chart** tab on every case: subjects at the top, suppliers, couriers and associates under them, and monikers, webpages, dark-web names, phones, wallets and places hanging off whoever uses them. Square photos from the case files (the same size on every card), platform pictures for Webpage, Dark Web, Google, Snapchat, Facebook / Instagram and Telegram, dashed lines for other connections. A big crew goes in rows so the chart fits a portrait page. PDF View, and Save PDF to Case (Files → Link Charts). Kept in the case folder as `linkchart.json`

## Features (v1.51)

- New colour icon set throughout the app (cut from CaseVault's own artwork, bundled in `icons/color`): folders (Operations blue, General Files yellow, Closed green, Archived dark), trash, calendar, phone, map, notebook, chat and more; a colour badge for each LEO partner agency (CaseVault's own drawings, not seals); one-colour versions stay on filled buttons and the Overview banner, which is unchanged
- New app logo (the safe with the document) for the tab, the header and the installed app
- Updater window: a blue fading banner like the Overview's, with a shield and padlock instead of the logo

## Features (v1.50)

- Privacy screen: blue 1s and 0s on a muted near-black, and a thin **AUTHENTICATE** box in the lower right (asterisks for the digits)
- Supplementary Report PDF: the labels sit on grey bands and the values on white (signature table too); the Officer's Report is unchanged
- Arrest details, Timeline, Contacts and Deconfliction: each field a grey box with its label inside, like the Draft tab
- CaseVault's own square calendar for every date box
- Case list: folders start folded (the one holding what's on screen opens), Search as an icon, Home and Hide next to it (the header keeps only the menu), a closed case of an open Operation also shows under Closed, Closed and Archived as grey folders with an arrow
- **Move File**: a case moves from General Files into an Operation, between Operations, or back (replaces Assign to / Unlink)
- Discovery: files from this case, its Operation, another Operation or any case; a box lists every file and the total size before anything is copied

## Features (v1.49)

- **Discovery** (Files tab): pick files, then CaseVault writes a password-protected package (AES-256-GCM, PBKDF2) for a USB drive or a DVD. The recipient opens *Open Discovery.html* in Chrome or Edge, with nothing to install, to view and print only: PDFs as page images, Word and Excel as read-only pages, video and audio playing in the window. Bates numbers on every page, an index with SHA-256 fingerprints, an optional portable VLC from the SSD, and a production log in the case

## Features (v1.48)

- Supplementary Report PDF: the R.D. Number in the top box
- Draft tab: each field in its own grey box with the label inside (the placeholder when empty), section headers in capitals, phone numbers folded away at first, Status and How Cleared spelled out (short codes stay on the PDF)
- Square drop-down lists (Chrome and Edge)
- Each report sent from the Draft tab is its own: sending again asks New Report (default) or Update
- Templates: only the DEA 6 sample stays (the others move to templates\removed-v1.48); the DEA 6 type is called DEA Style

## Features (v1.47)

- Overview: **General Files** between Operations and Recently Updated, one amber folder per year (newest first) for the cases not in an Operation; General Files folders are amber everywhere, Operations stay blue
- Supplementary Report PDF: exhibit photo captions in regular type (no bold first line)

## Features (v1.46)

- **Operations and General Files:** an Operation is its own record (Operation Number, Name, Status, Start and End Date, Notes), shown as "Number - Name"; every case lives in General Files and is linked to none or one Operation. An Operation's Files are its linked cases (nothing is copied). Create, edit (renames every case once), delete (the cases and files stay, independent), add a new or an existing case, unlink with a confirmation
- Cases show the **Case Number** with the **Subject Name** under it; Case Numbers are unique (archived ones count); the same subject on another case asks first, a similar name is pointed out, nothing is merged
- A vault from before v1.46 is backed up, then cases sharing a Title become an Operation (number from the File Number, else OP-001…), subjects come from each case's first suspect; duplicate Case Numbers are flagged, not changed
- Templates: `{{case.subject}}`, `{{operation.number}}`, `{{operation.name}}`; search covers the subject and the Operation

## Features (v1.45)

- Symmetrical PDFs: the Supplementary Report's boxes all sit on one eight-column grid (every label on one line, Status and How Cleared half each, the four numbers as boxes); the Arrest Report shows every value in a grey box, with each list's labels the same width so the boxes line up, and the charges, narcotics and warrants in grey rows on fixed columns
- Compact, symmetrical entry forms: the Draft tab and the Arrest Details tab use tighter rows, and no box is left alone on a row (Arrest Details in four columns, the photo as the fourth column beside the offender)
- PDFs: military time without the colon (1435); the Supplementary Report's values sit in light grey boxes (no dotted lines), each person's name in bold on its own line with the details under it, and the officer's report lines in blocks with space between them
- Details tab: Title, Status, Opened and Closed in one row; File Number, Original Case Number, Federal Jacket Number and Client in one row; no Tags; a clearer U.S. Marshals emblem
- Overview: an open operation's case numbers link to Details, Reports and Files only
- Draft tab: Method Code and Safe Method offer DNA; the counts, a person's Gender / Gender Identity / Race / Complexion and Height / Weight / Hair / Eyes, and the Assignment boxes each fit in a row; "Not Recovered" and the Files size are no longer cut off
- The Supplementary Report PDF is laid out like a narcotics division supplementary report form: Times type, a ruled grid with small labels, Update Information tick boxes, Status and How Cleared with a mark under each choice, the officer's report as "LABEL:" lines, the summary of investigation and a three-column signature table; other pages carry Preparer and Approval initial boxes
- The Arrest Report PDF is laid out like a records-system arrest report: the numbers stacked top right, an ARREST REPORTING band, each section named on a grey tab down the left, "Label: value" text, Court Info and Bond Info side by side, and the reporting personnel with signature fields
- Overview: Upcoming Deadlines is gone (the banner shows what's due); an open operation folder shows each case number with all its tabs (Details, Timeline, Draft, Reports, Files, Mail, Checks) in that spot, so the folders never move; the timeline's titles are centered; a new two-tone operation folder icon
- Sidebar: restyled; operations whose case numbers are all Closed sit in a Closed section at the bottom, above Archived
- Field Notes single spaced, with no fading at the bottom of the Reports card; no hover boxes over the Field Notes and report names
- Reports list shows "Purchase" rather than "Supplementary Report - Purchase" (the type is in its own column), and every report can be sent to Files from the list or its viewer
- Draft tab: the IUCR Code box holds just the code (Offense Classification gets the description); Pre-Recorded Funds is one compact row per bill, with no Quantity; Notifications have no Notes; exhibit numbering can be reset to 1 or started from any number
- Files: the Document column breaks only between words
- Dev Tools restyled in numbered steps; Emergency Purge has a skull and crossbones
- Draft tab: each sent report is named after its heading (Supplementary Report - Purchase). Change the Officer Report Type and send again, and CaseVault asks whether to make a **New Report** (the UCO's and the surveillance officer's reports of one buy) or update the one sent; two reports never share a title or a PDF
- Exhibit photos are named like their labels on the Draft tab (Exhibit 1a, 1b), and older "Exhibit 1 (2)" names are renamed to match
- Timeline: a **Clear** button next to Add to Timeline; each date on one line next to its marker
- Reports tab is view only: click a report to see its PDF the way the Files tab shows it; drag the rows (or Alt+Up / Alt+Down on the grip) into your own order; **Send Back to Draft** from the list or the viewer; the Field Notes stay editable
- Every report sent from the Draft tab prints exactly like the Draft tab's Print / PDF, including older ones sent before a Clear All
- Sidebar: an operation's name opens its Details (the arrow folds it); Timeline tab: no stray "null"
- Suspects: IR, FBI and IDOC Numbers and a Phone Number, in even columns; Offenders: phone numbers (Add Another Phone) and monikers with their social media app
- Draft tab: picking an IUCR code fills Offense Classification ("Delv: Synthetic Drugs"); the heading and the report title follow the Officer Report Type (Supplementary Report - Purchase); **Purchase Price** with each pre-recorded bill (quantity, denomination, serial number, recovered or not); Show All / Hide All at the top, Save Changes with the other buttons
- Reports sent from the Draft tab are view only, with **Send Back to Draft** for revisions
- **Close Case** asks who closed it, lists the operation's case numbers to tick, and fills each one's Draft tab (Status, How Cleared, Update Information boxes)
- Files: exhibit photos named "Exhibit 1"; the Added date on one line

## Earlier (v1.38)

- Overview: a click on empty space closes the open operation folder
- Every suggestion list is CaseVault's own square one (File Number, Hair and Eye Color, contact roles, mail addresses…), and the browser's round history pop-up is turned off everywhere; **File Number** lists each number with its operation

## Earlier (v1.37)

- Details: each case-number folder opens that case's **Reports** tab; a slim **timeline** under them (a line with small dots for the operation's events and a Today mark; point at a dot for its date, title and note, click it for the Timeline tab); each suspect is a darker box, so the count shows at a glance
- Sidebar: **Titles only** (next to the search box) folds every operation so only its title shows; each operation still folds on its own (click its title), even with one of its cases open

## Earlier (v1.36)

- Square corners everywhere (boxes, buttons, cards, tabs, menus, dialogs, tags) and traditional drop-downs with one arrow on the right, the same for every list
- No clipped words: long names, dates, Race choices and placeholders show in full (they wrap instead of ending in "…")
- LEO Partners: once one is picked, the others dim; suspect role **Primary** (was Main); placeholders without "e.g." (5 ft 10 in, 160 Pounds)

## Earlier (v1.35)

- The updater updates itself: its own new files wait in `updater\_next` and are put in place the next time `Check-For-Updates.bat` starts (until now the `updater` folder had to be copied by hand)
- The updater shows the CaseVault logo (the folder with the padlock) instead of the "CV" square; the 8-bit dinosaur is gone and the plain progress bar is back

## Earlier (v1.34)

- Report editor: **Word View** next to **PDF View**, and the buttons in order (Word View, PDF View, Draft with AI, Re-phrase, Review, Export, Save, Delete); Export is just **Save to Case Files**, **Save to PC** and **Save Template**
- Reports: Field Notes and Reports as cards, the AI tag in its own column; the Draft tab's buttons stay in view
- Officer's Report: every line and list has its tick box, labels written the same way (not all capitals); evidence photos get a **label** each (printed in the PDF caption) and a big **Add Photos** tile
- LEO Partners adds **ATF**, **USMS** (U.S. Marshals) and **State PD**, federal first, then state and local, then Other; Suspects get demographics (gender, race, complexion, height, weight, hair, eyes, tattoos / scars); Deconfliction **System** is a drop-down
- Files: the Added date wraps instead of being cut off; sidebar hide button on the left, padlock on the right; a taller Anonymizer drop box

## Earlier (v1.33)

- **Send Draft to Reports** on the Draft tab puts the report under Reports and its PDF under Files in one click (Save PDF to Case and Create Report are gone); **Clear All** empties the form for another report, and the next send makes a new one
- **Field Notes** have their own section at the top of Reports, always there
- The Overview's operation **Timeline** is a clickable sideways timeline with a Today marker (no separate Open Timeline link)
- **LEO Partners** as agency badges with icons and colors (Local PD star, Sheriff shield), adding **ICE** and **USSS** (Secret Service); **Deconfliction** as cards so no field is cut off
- **Consolas** everywhere

## Earlier (v1.32)

- **One report, one PDF:** the Draft tab keeps one Supplementary Report under Reports; its PDF View and the Draft tab's PDF are the same file, saved once in Files (replaced, not copied)
- Dates in full everywhere (September 30, 2026); no "Updated" dates on pages and no dates in saved file names
- Case list and Overview in File Number order; every operation is a blue folder with its file number, original case and client; the open operation's Timeline on the Overview; Clear for Recently Updated
- Reports lists reports only (New Report button); arrest charges offer the report's charges; long Document names wrap in Files; the Anonymizer takes dropped .docx, .md and .txt files

## Earlier (v1.31)

- **Draft** tab (between Timeline and Reports): the Supplementary Report form, with Print / PDF and **Create Report** (Send Draft to Reports since v1.33), which makes an editable report laid out like the PDF; **PDF View** in the report editor shows any report as a PDF in the same style and saves it to the case
- **Reports**: Field Notes and the reports, with **New…** (Notes or Report) in place of the New report box
- Officer's Report lines in the new order with AUSA, IR and CB numbers; UCO; no reclassification row; Federal Jacket Number; Find my Beat quick link; one font (the editor's) everywhere; the updater shows the CaseVault logo

## Earlier (v1.30)

- **Arrest Report:** the Arrest details tab is laid out like an arrest report (Report Numbers, Offender with photo, Incident, Charges, Recovered Narcotics, Warrant, Victim and Complainant, Arrestee Vehicle, Properties, Incident Narrative, Court and Bond, Reporting Personnel), one per arrestee
- **Print / PDF**, **Save PDF to Case** (Arrest Report folder) and **Email for E-Sign**, in the same style as the Supplementary Report PDF, with signature fields; arrest details from older versions open in the new layout

## Earlier (v1.29)

- **Delete Arrest** on the Arrest details tab and under Case actions (also for a case closed by arrest); the arrest charges suggest the Illinois and federal statutes
- Operations on the Overview: Field Notes, Reports, Photos and Files as words under each case number; the Timeline next to the operation; a muted folder colour. Files has a **Photos** view
- Quick links: **Arrange** (arrows or drag) and Google Maps; tabs no longer cut off
- No ⓘ icons: explanations show when you point at a heading or label. No placeholders in the Timeline title/note or the mail To box; a wider Document column
- Fixed: the drive icon blinking (the case list saved on every redraw); the sidebar search box is squarer

## Earlier (v1.28)

- **Operations on the Overview:** a blue folder for each Title or Operation Name; open one for its case numbers, each with Reports, Field Notes, Files and Photos and Timeline
- **Dev Tools:** the **Document Anonymizer** (one Anonymize button runs the rules and then the local AI; bigger Original box with the result under it; Clear) and an **Emergency Purge** that empties CaseVault-Data. Deleting a case also removes it from older vault.json backups and its Ask AI chats
- Case list: cards, case numbers not bold, the deadline bell next to the title or operation; New Case on the Overview only. Reference, Library and Vault on the Overview, not the menu
- Memory box: Local AI, RAM in use of total, RAM free, drive free (click the icon to unload the AI model). Model names start with a capital letter
- Quick links: Charges asks Federal or State Statute; Chainalysis in OSINT with Google; Snapchat and Meta LE portals in LEO; no Edit Links button. Only the Supplemental Report starter template remains; chicagopolice.org is added to existing mail domain lists

## Earlier (v1.27)

- **Operations:** the Details tab shows the Title or Operation Name, Status, Opened and Closed at the top with a folder tile for each case number; a shared **Case Overview** (Suspects, Contacts, Deconfliction) below a line, the same in every case of the operation; **Close Operation** or close each case number on its own
- **One Timeline per operation:** the events of all its case numbers together, each marked with its case number
- **Remove Arrest Details**; **Close Case** and **Archive Case** without the dots; Ask AI's Clear is a fire icon
- Files table: Name (`2024-JH123456 | name`), Document, File (`.docx`), Size, Added (`09.30 08.57`)
- The memory box shows Drive, Vault, Model (follows Ask AI) and RAM; LEO Partners gains **Other**; **State of Illinois** victims get an Officer Name only; chicagopolice.org added to mail domains; no icons in Report Fields and the Library; no `.md` on template and library names; more room at the bottom of every page

## Earlier (v1.26)

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
