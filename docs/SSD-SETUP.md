# SSD setup

This guide prepares the **SanDisk Extreme 1TB** for CaseVault on Windows 11 Pro. You do it once. At the end you will have:

| Partition | Letter | File system | Size | Encrypted | Holds |
|---|---|---|---|---|---|
| **CASEVAULT** | `V:` | exFAT | ~850 GB | Yes, BitLocker To Go | `CaseVault-Data\` (cases, backups, check results) and `CaseVault-App\` (offline copy of the app) |
| **CV-AI** | `W:` | NTFS | ~150 GB | No (holds no case data) | `ollama\`, `models\`, `Start-CaseVault-AI.bat` |

> ⚠️ **Partitioning erases the drive.** Copy anything you need off the SSD first.

---

## 1. Split the drive into two partitions

1. Plug in the SSD. Press **Win + X** and choose **Disk Management**.
2. Find the SanDisk in the lower pane. It shows as roughly **931 GB** (Windows counts in binary units, so a "1 TB" drive shows as 931 GB). Double-check the disk number and size. Picking the wrong disk here wipes it.
3. Right-click the SanDisk's existing volume and choose **Delete Volume…**, then **Yes**. The whole bar turns into *Unallocated*.
4. Right-click the unallocated space and choose **New Simple Volume…**:
   - **Size:** `810000` MB. That is about 850 decimal GB, the CASEVAULT partition.
   - **Drive letter:** `V`
   - **Format:** File system **exFAT**, allocation unit **Default**, volume label **`CASEVAULT`**, **Perform a quick format** ticked.
5. Right-click the remaining unallocated space (about 140 GB) and choose **New Simple Volume…**:
   - **Size:** accept the maximum offered.
   - **Drive letter:** `W`
   - **Format:** File system **NTFS**, allocation unit **Default**, volume label **`CV-AI`**, quick format.

Why two file systems? **exFAT** on V: can be read on almost any computer, so your case files are never locked to one PC. **NTFS** on W: suits the AI engine and its model files, which are large and read many times.

## 2. Fix the drive letters (and what happens if they change)

Windows remembers the letter you gave each partition, **per computer**. Repeat step 1's lettering on each PC:

1. On the **Lenovo L14** (and any other PC), plug in the SSD and open **Disk Management**.
2. Right-click each SanDisk partition and choose **Change Drive Letter and Paths… → Change**. Set CASEVAULT to **V** and CV-AI to **W**.

If a letter is already taken on some PC (a network drive, for example), choose any free letter. **Nothing breaks:**

- **CaseVault** doesn't use drive letters. If it can't find the vault, click **Reconnect**. If that fails, click **Choose folder…** and pick `CaseVault-Data` on the SSD once. The app recognises the vault by its ID, not its letter.
- **`Start-CaseVault-AI.bat`** finds its own drive letter every time it runs.

## 3. Encrypt V: with BitLocker To Go

This protects every case if the SSD is lost or stolen. Windows 11 Pro includes BitLocker.

1. Open **File Explorer**, right-click **CASEVAULT (V:)** and choose **Turn on BitLocker**. You can also search the Start menu for **Manage BitLocker**, then **Removable data drives – BitLocker To Go**, then **V:**, then **Turn on BitLocker**.
2. Choose **Use a password to unlock the drive**. Use a long passphrase (for example four or five unrelated words, 20+ characters). You'll type it each time you plug in.
3. **Back up the recovery key.** This is the only way in if you forget the password.
   - **Print** it and store the paper somewhere secure, away from the SSD. Recommended.
   - Optionally, **save it to a file** on a *different* drive that is itself encrypted.
   - Never store the recovery key on the SSD itself.
4. **Encrypt used disk space only** is fine for a freshly formatted drive. Choose **Encrypt entire drive** if the SSD ever held other data.
5. Encryption mode: both of your PCs run Windows 11, so choose **New encryption mode**. (Choose *Compatible mode* only if you'll ever need to unlock the drive on Windows 7/8.)
6. Click **Start encrypting**. You can keep using the drive while it runs. **Don't unplug it until encryption is complete.**

### Unlocking

When you plug the SSD in, Windows shows *"This drive is BitLocker-protected"*. Click it and enter the password. V: stays locked, and CaseVault can't see it, until you do.

**"Automatically unlock on this PC"**: leave this **off**. With it on, anyone holding both the PC and the SSD can read your cases. Turn it on only if the PC itself is encrypted and physically secure, and you accept that trade-off.

### Why W: isn't encrypted

W: holds only the Ollama program and public AI model files, which are nothing confidential. CaseVault never writes case data to W:. Don't save documents there yourself. (You *can* turn on BitLocker for W: too if you prefer; the AI engine will just need W: unlocked before it starts.)

## 4. Create the folders

On **V:**:

```
V:\
  CaseVault-Data\     ← created by CaseVault the first time you connect (don't make it by hand)
  CaseVault-App\      ← offline copy of the app (see USING-CASEVAULT.md, "Offline copy")
```

On **W:**, following [AI-SETUP.md](AI-SETUP.md):

```
W:\
  ollama\                   ← portable Ollama for Windows
  models\                   ← AI model files
  Start-CaseVault-AI.bat    ← launcher
```

## 5. Look after the drive

- **Eject before unplugging.** In CaseVault, wait until the header says **Saved to SSD**, close the app, then use **Safely Remove Hardware** in the taskbar. exFAT is easily damaged by a pull mid-write.
- Keep Windows' default **Quick removal** policy for the SSD (Device Manager → the SanDisk → Properties → Policies). It makes Windows write changes to the drive immediately.
- If Windows ever says the drive needs scanning, let it, or run `chkdsk V: /f` from an administrator Command Prompt (with V: unlocked).
- **Keep a second copy.** One SSD is one point of failure. Regularly copy `V:\CaseVault-Data` to a second BitLocker-encrypted drive kept in a different place.
