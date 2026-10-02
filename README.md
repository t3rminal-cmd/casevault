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

## Features (v1.56)

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
