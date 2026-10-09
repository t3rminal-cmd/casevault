# Keeping CaseVault and Your Cases Safe

CaseVault never connects to the internet, and it never keeps case data on the PC. The cases live
on the SSD, so **the SSD's encryption is what protects them**. This page lists what protects what,
and the settings only you can turn on.

## 1. Your cases (on the SSD)

| What | Protected by | Check |
|---|---|---|
| Cases on **V:** | BitLocker To Go on the CASEVAULT partition | CaseVault shows a red **Not Encrypted** chip next to Overdue on the home page, and a warning at startup, when V: has no BitLocker (Firefox with the helper; Chrome and Edge can't tell). ⋮ → Vault → Backups shows the drive's state |
| A full backup on another drive | BitLocker on that drive | The backup drive list shows each drive's encryption; picking one without BitLocker asks first |
| A full backup on another PC (shared folder) | That PC's BitLocker or Device encryption, a share for your account only, and SMB encryption | CaseVault can't check another PC; the first backup to a folder asks you to confirm. See [BACKUP-TO-ANOTHER-PC.md](BACKUP-TO-ANOTHER-PC.md) |
| Discovery exports | Their own password (AES-GCM) | — |
| The screen while you step away | The privacy screen and its PIN (stored as a slow PBKDF2 hash since v1.106) | The PIN only hides the screen. It does not encrypt anything. Copied case text is cleared from the clipboard when the screen comes on |
| A deleted case | Recently Deleted keeps it 30 days in `CaseVault-Data\\deleted` (on the encrypted SSD) | Delete Now removes it at once |

**BitLocker settings:** set Windows to **XTS-AES 256** for removable drives *before* encrypting
(Group Policy → BitLocker Drive Encryption → Choose drive encryption method and cipher strength).
The default for removable drives is AES-CBC 128. Keep the recovery key somewhere other than the PC
and the SSD. If your cases are CJIS data, ask your department's IT which settings they require.

**Files that leave CaseVault land on the PC.** A PDF saved through the browser's Print → Save as PDF,
an attachment opened in Outlook, or anything in Downloads is outside the vault. Delete them when
you are done.

## 2. The code (this GitHub repository)

The repository is public and holds **no case data**: a check stops any deploy that contains
anything that looks like a case file, and every test makes up its own Doe/Roe/Poe data.

The updater and the GitHub Pages copy install whatever is on `main`. **Whoever can push to `main`
can run code on the PC while V: is unlocked**, so the GitHub account is what to protect.

Turn these on (only the repository owner can):

- [ ] **Two-factor sign-in** on the GitHub account, with a passkey or a hardware security key
      (github.com → Settings → Password and authentication).
- [ ] **Branch protection on `main`**: Settings → Rules → Rulesets → New branch ruleset → target
      `main` → Require a pull request before merging, Require status checks to pass (**Safety
      checks** and **Browser tests**), Block force pushes, Restrict deletions.
- [ ] **Secret scanning and push protection**: Settings → Code security → Secret Protection
      (free for public repositories).
- [ ] **Dependabot alerts**: Settings → Code security → Dependabot alerts.
- [ ] Review **Settings → Applications** and **Settings → Sessions** now and then, and remove
      anything you don't recognise.

What the repository already does:

- The workflow's Actions are pinned to exact commits, and Dependabot proposes updates monthly.
- The workflow can only read the repository; only the publish step may write to Pages.
- Every change runs the safety checks, the unit tests and the browser tests before it is published.
