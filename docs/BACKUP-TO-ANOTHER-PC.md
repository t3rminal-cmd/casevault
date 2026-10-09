# Backing Up to Another PC at Home (e.g. a Beelink)

The cases stay on the SSD. **Back Up Everything** can also copy the whole vault to a shared folder
on another PC at home, such as a Beelink mini PC, over your home network. The backup lands in
`CaseVault-Backups` inside that folder and is read back and checked file by file, like a backup to
a USB drive.

A backup is a full copy of every case. CaseVault can't see whether the other PC's drive is
encrypted, so **set that PC up first** (part 1). The first time you back up to it, CaseVault asks
you to confirm you did.

## 1. On the Beelink (once)

1. **Turn on drive encryption.** Windows Pro: Settings → Privacy & security → Device encryption,
   or Control Panel → BitLocker Drive Encryption → Turn on BitLocker. Windows Home: Settings →
   Privacy & security → **Device encryption** → On. Keep the recovery key somewhere other than the
   Beelink and the SSD.
2. **Make the folder,** for example `C:\CaseVault-Backups`.
3. **Share it with your account only.** Right-click the folder → Properties → Sharing → Advanced
   Sharing → tick *Share this folder* → Share name `CaseVault-Backups` → Permissions → remove
   **Everyone** → Add your own account → tick **Change** and **Read** → OK.
   Use a Windows account with a password; a share with no password is open to anyone on the network.
4. **Encrypt the share's traffic.** In PowerShell as administrator:

   ```powershell
   Set-SmbShare -Name CaseVault-Backups -EncryptData $true -Force
   ```

5. Settings → Network & internet → your connection: the network profile is **Private**.
   Note the PC's name (Settings → System → About → Device name), e.g. `BEELINK`.

## 2. On the PC you work on

1. In File Explorer's address bar type `\\BEELINK\CaseVault-Backups` and press Enter. Sign in with
   the Beelink account from step 3 and tick *Remember my credentials*. You should see the folder.
2. Open CaseVault → ⋮ → Vault → Backups → **Back Up Everything**.

**Firefox (helper mode):** click **Add Network Folder**, type `\\BEELINK\CaseVault-Backups`, click
**Add**. CaseVault checks it can write there and lists it first, with a globe icon. Pick it →
**Back Up to This Drive**. The first time, tick *I checked: that PC is encrypted and the shared
folder is only mine* → **Back Up to This Folder**. The list is kept on the SSD (in
`CaseVault-Data\backup-network.json`), so it follows the SSD to another PC. When the Beelink is off
the folder shows *not reachable* and can't be picked. **Remove** takes it off the list; the
backups already there stay on the Beelink.

**Chrome or Edge:** the folder picker can't type a `\\` path. Map a drive letter first: File
Explorer → This PC → ⋯ → Map network drive → letter `Z:` → folder `\\BEELINK\CaseVault-Backups` →
tick *Reconnect at sign-in*. Then pick `Z:` in Back Up Everything. (A mapped drive also shows up in
Firefox's list, marked *network drive*.)

## 3. Restoring from the Beelink

Each backup is a plain folder, `CaseVault-Backups\CaseVault-Backup-<date>`. To restore onto a new or
wiped SSD, copy what is inside it into an empty `CaseVault-Data` folder on the SSD's CASEVAULT partition, then
open CaseVault. To restore a single file, open the backup folder from File Explorer and copy it.

## Good to know

- Back up with the Beelink on and the SSD plugged in. Wi-Fi works; a cable is faster.
- Keep a USB backup drive as well: a second copy in another place protects against fire or theft.
- Never share the folder with *Everyone* or turn off password-protected sharing.
