# CV-AI drive setup: launcher, helper and AI engine

The **CV-AI (W:)** partition holds everything CaseVault runs *next to* your data:

| On W: | What it is | Needed for |
|---|---|---|
| `Start-CaseVault.bat` | The launcher: double-click to start CaseVault | Firefox (always); AI review (any browser) |
| `casevault-helper\` | The CaseVault helper, a small local server | Firefox |
| `ollama\` | Portable [Ollama](https://ollama.com), the local AI engine | AI review in the Consistency Checker |
| `models\` | AI model files | AI review |
| `logs\` | Ollama's log files (created automatically) | — |

When everything is in place, W: looks like this:

```
W:\
  Start-CaseVault.bat        <- double-click this to start CaseVault
  casevault-helper\
    casevault-helper.ps1
  ollama\                    portable Ollama
  models\                    Ollama's models (created by "ollama pull")
  logs\                      created automatically
```

`Start-CaseVault.bat` goes in the **root of W:**, next to the `casevault-helper` folder, not inside it. It finds everything else relative to where they are, so the drive letter doesn't matter.

Everything runs on your own computer and **listens on 127.0.0.1 only**, so nothing on the network can connect to it. Nothing needs installing, and nothing needs admin rights.

Finish [SSD-SETUP.md](SSD-SETUP.md) first so that W: exists.

---

## 1. Copy the launcher and the helper to W:

From this repository (download it with **Code → Download ZIP** and extract it):

1. Copy `tools\Start-CaseVault.bat` to **`W:\Start-CaseVault.bat`**.
2. Copy the folder `tools\casevault-helper` to **`W:\casevault-helper`**.

The helper also serves the CaseVault app itself, from **`V:\CaseVault-App`**. If you haven't copied the app there yet, do that now (see [USING-CASEVAULT.md](USING-CASEVAULT.md), *Offline copy on the SSD*).

## 2. Put portable Ollama on W:

Do this on a PC with internet. It's a one-time download.

1. Go to **https://github.com/ollama/ollama/releases/latest**.
2. Under *Assets*, download **`ollama-windows-amd64.zip`**. This is the standalone build. Don't use `OllamaSetup.exe`, which installs to the PC's internal drive.
3. Extract it into **`W:\ollama\`** so that `W:\ollama\ollama.exe` exists.

> If the regular Ollama app is installed on a PC, quit it from the system tray (llama icon → *Quit*) before using the launcher. Better still, uninstall it so it can't start with Windows and keep models on the internal drive.

## 3. Start CaseVault with the launcher

1. Plug in the SSD and unlock **V:** (BitLocker).
2. Double-click **`W:\Start-CaseVault.bat`**. A window titled *CaseVault helper* opens and shows:

   ```
   CaseVault helper 1.10.0
   Vault     : V:\CaseVault-Data
   App       : V:\CaseVault-App
   AI engine : Ollama started, models in W:\models
   Address   : http://127.0.0.1:8517/  (this computer only)
   ```

3. Your default browser opens **http://127.0.0.1:8517/**. In Chrome or Edge you can also keep using the installed app; it will see the AI engine too.
4. **Keep the window open** while you work. Closing it stops both the helper and the AI engine.
5. To finish, click **Power Off** (the red button at the top of CaseVault). It saves, closes the browser window, the helper and the AI engine, and locks and ejects **V:** and **W:**. Locking BitLocker may need admin rights; ejecting doesn't. If a drive is still busy, Windows says so: close what's using it and eject it from the taskbar.

What the launcher does:

| | |
|---|---|
| Finds your vault | It looks for the partition labelled **CASEVAULT** (or any drive with `CaseVault-Data\vault.json`), whatever its drive letter. If you unplug and replug the SSD, or it comes back with a new letter, it finds it again. |
| Starts Ollama | It sets `OLLAMA_MODELS=<this drive>\models`, `OLLAMA_HOST=127.0.0.1:11434`, and `OLLAMA_ORIGINS` for the CaseVault page (hosted and helper), then runs `ollama serve` in the same window. |
| Runs the helper | Windows PowerShell 5.1, built into Windows. `-ExecutionPolicy Bypass` applies to that one run only and changes nothing on the PC. |

If Windows Defender Firewall asks about `powershell.exe` or `ollama.exe`, click **Cancel** or deny it. Both only need to reach this computer.

### How the helper keeps other websites out

The helper only answers requests that come from the CaseVault page itself:

- It only accepts requests addressed to `127.0.0.1:8517` or `localhost:8517`, which blocks DNS-rebinding tricks.
- Every data request must carry a custom header, so other sites trigger a browser security check (a CORS preflight) that the helper refuses.
- It rejects any foreign `Origin` or cross-site `Sec-Fetch-Site`.
- Paths are confined to `CaseVault-Data`, and `..` or drive letters are refused.
- Files are written to a temporary file first and then swapped in, so a pulled cable never leaves half a file.
- It opens only one kind of file in another program: an `.eml` mail draft inside a case's `files\Email` folder (the Mail tab's Outlook draft). Anything else is refused.
- For the memory indicator it reports only numbers: total and free RAM, and the vault drive's size and free space.

## 4. Download models to W:

With the launcher running, open **a second** Command Prompt and run the `pull` commands below (adjust `W:` if your letter differs). The engine saves the models into `W:\models`.

CaseVault offers four **AI profiles**. It detects which models are installed and shows only the usable profiles:

| Profile | Size class | Runs on | Suggested model | Download |
|---|---|---|---|---|
| **Quick** | ~7–8B | Beelink GTi12. Fits fully in the RTX 3050's 6 GB of VRAM. | `qwen2.5:7b` *(or `llama3.1:8b`)* | ~4.7 GB |
| **Thorough** | ~12–14B | Beelink. Split between the GPU and 32 GB of RAM, slower but more careful. | `qwen2.5:14b` *(or `gemma3:12b`)* | ~9 GB |
| **Light** | ~3–4B | Lenovo L14. CPU only. | `qwen2.5:3b` *(or `llama3.2:3b`)* | ~2 GB |
| **Rules-only** | none | Anywhere | *(no model; the rule-based checks always run)* | — |

Also recommended, for better passage search (finding the report passages that relate to each statement):

| Purpose | Model | Download |
|---|---|---|
| Passage search | `nomic-embed-text` | ~0.3 GB |

```bat
W:\ollama\ollama.exe pull qwen2.5:7b
W:\ollama\ollama.exe pull qwen2.5:14b
W:\ollama\ollama.exe pull qwen2.5:3b
W:\ollama\ollama.exe pull nomic-embed-text
W:\ollama\ollama.exe list
```

That's about 16 GB, which fits comfortably on the 150 GB partition. CaseVault sorts models into profiles by size, so newer models of the same size work too.

You don't need all of them. **Quick + Light (+ nomic-embed-text)** covers both PCs: the Beelink uses Quick, the L14 uses Light. Skip Thorough unless you want it for important documents on the Beelink; on the 6 GB RTX 3050 it's split into RAM and is several times slower.

### Adding nomic-embed-text (passage search) later

`nomic-embed-text` doesn't write anything. It turns each report passage into a "meaning fingerprint", so the AI review and *Draft with AI* read the passages that are **about** the statement, even when they use other words ("fled on foot" vs "ran away"). Without it CaseVault finds passages by matching words only. It's small (about 0.3 GB) and runs on either PC.

1. Plug in the SSD and double-click **`W:\Start-CaseVault.bat`**. Leave its window open: the AI engine must be running, and it saves models to `W:\models`.
2. Press **Windows key + R**, type `cmd` and press **Enter**. A black Command Prompt window opens.
3. Type (or paste) this and press **Enter**. Use your drive letter if it isn't W:
   ```bat
   W:\ollama\ollama.exe pull nomic-embed-text
   ```
   It downloads about 270 MB and ends with **success**. (This one step needs internet; nothing about your cases is sent.)
4. Check it's there:
   ```bat
   W:\ollama\ollama.exe list
   ```
   You should see `nomic-embed-text:latest` next to `qwen2.5:7b` and your Light model.
5. In CaseVault, click **AI:** in the header, then **Check again**. The dialog shows **✓ Passage search: nomic-embed-text:latest**. (Without it, the same dialog shows these steps with a **Copy** button for the command.)
6. Optional: **Vault → Run self-test** shows *Passage search model … is installed*.

Because the model lives on W:, you do this **once**, and both the Beelink and the L14 use it. If `ollama.exe` says it can't connect, the launcher window isn't running: start it and try again.

### Choosing a profile

The header shows the engine status: **AI: Quick · qwen2.5:7b**, **AI: Offline**, or **AI: Rules-only**. Click it to:

- see which models were found;
- pick **Auto**, **Quick**, **Thorough**, **Light**, or **Rules-only**;
- **Check again** after starting the launcher.

**The profile is remembered per PC** (by that PC's browser), not on the SSD. The Beelink and the L14 read the same models from W:, but should not run the same one. Only the profile word is stored in the browser, never case data. A *Rules-only* choice made before v1.9.1 still applies.

**Auto** picks for the PC it runs on:

- Once a model has loaded, Ollama reports how much of it sits on the graphics card. If the Quick model runs mostly on the processor (the L14), Auto uses **Light** from then on and tells you so once. On the Beelink it runs 100% on the RTX 3050, so Auto keeps **Quick**.
- Before that, Auto goes by the graphics chip the browser reports: NVIDIA (or an AMD Radeon RX card) → Quick; Intel or other built-in graphics → Light.
- The AI dialog explains the decision, for example *"qwen2.5:7b ran 0% on the graphics card here… Auto uses Light first."*

**Drafts** use the same engine. *Draft with AI* uses the model of the chosen profile. **AI suggestions while typing** always use the smallest installed chat model (Light if you have it). Install a Light model (`qwen2.5:3b`) even on the Beelink if you want snappy suggestions.

### Other models, including less-filtered ones

Any chat model Ollama can run works in CaseVault. **Ask AI** (the chat) has a model list with every installed model, so you can add one and pick it there without changing the profiles the checker and drafts use.

Mainstream models (Qwen, Llama, Gemma) sometimes refuse or hedge on law-enforcement topics: drugs, weapons, violence, how a crime was committed. **Less-filtered** fine-tunes answer those plainly. The best-known family is **Dolphin**; others are published as *abliterated* versions of mainstream models. Sizes that fit your PCs:

| PC | Model | Download | Notes |
|---|---|---|---|
| Beelink (RTX 3050, 6 GB) | `dolphin3` (Dolphin 3.0, Llama 3.1 8B) | ~4.9 GB | Same size class as Quick; fits the GPU at CaseVault's 4,096-token context |
| Beelink | `dolphin-mistral` (7B) | ~4.1 GB | Older, also fits the GPU |
| L14 (CPU only) | `dolphin-phi` (2.7B) | ~1.6 GB | Small enough for the processor; weaker answers |

**Step by step (dolphin3 as the example).** The same steps, with a **Copy** button for each command, are in CaseVault. Click the robot in the middle of the header, then open **Add another AI model**.

1. Start `W:\Start-CaseVault.bat` and leave its window open (the AI engine must be running). The PC must be online for the download.
2. Press **Windows key + R**, type `cmd` and press **Enter**.
3. Paste the command and press **Enter**. Use your drive letter if it isn't W:.

   ```bat
   W:\ollama\ollama.exe pull dolphin3
   ```

   On the L14, use `dolphin-phi` instead. The download takes a few minutes. Wait for **success**. The model is saved in `W:\models`, so it downloads only once and is there on both PCs.
4. Check it's there: `W:\ollama\ollama.exe list`.
5. In CaseVault, click the robot in the header, then **Check again**. The model now shows under *Installed models*, and the table marks it **✓ Installed**.
6. Click **Ask AI**, open **Model**, pick `dolphin3:latest` and ask away. Your choice is remembered in the vault.

To remove a model later: `W:\ollama\ollama.exe rm dolphin3`.

Model names on ollama.com change over time: if a `pull` says *file does not exist*, search **ollama.com/library** (or ollama.com/search for "abliterated") and use the name shown there, in a 7–8B size for the Beelink.

Before you rely on one:

- **Fewer refusals, not more knowledge.** These models aren't smarter; they're just less likely to say no. They're also more likely to go along with a wrong premise or make something up, so check every answer, as with any AI.
- **Keep the default models for checks and drafts.** The consistency checker and Draft with AI are tuned and tested with Qwen. Use the less-filtered model in Ask AI.
- **Still offline.** The download needs internet once; after that it runs on W: like the others, and nothing you ask leaves the PC.
- **Policy.** Follow your agency's rules on which AI tools you may use.

### Speed on a small GPU (6 GB)

CaseVault sets these for you, so a 6 GB card like the RTX 3050 isn't overloaded:

| Profile | Context size (`num_ctx`) | Why |
|---|---|---|
| Light | 4,096 tokens | Small and quick |
| Quick | 4,096 tokens | A 7–8B model at 4,096 stays fully on the 6 GB GPU. A larger context pushes part of it into RAM, which is several times slower. |
| Thorough | 8,192 tokens | Already split between GPU and RAM, so it gets the larger context |

- Report passages are trimmed to fit that context, best matches first, so nothing is cut off silently. With Quick, a check sees a few fewer passages per statement than with Thorough.
- Every request asks Ollama to keep the model loaded for **10 minutes** (`keep_alive: "10m"`). After that the GPU memory is freed. The first request after a pause loads the model again, and the header then shows **Loading model…** (usually 10–30 seconds).
- **One thing at a time.** A consistency check and *Draft with AI* never run together: the second one waits (the header says **Waiting…**). Suggestions while typing pause while either is running.
- All requests to one model use the same context size, because Ollama reloads a model whenever it changes.

### The activity indicator

While the AI is working, a small moving waveform appears next to **AI:** in the header, with what it's doing: **Checking 11 of 16**, **Drafting…**, **Suggesting…**, **Indexing…**, **Waiting…** or **Loading model…**. Point at it (or Tab to it) for the model name, the time so far, and the speed in tokens per second (from Ollama's own figures). It disappears when the AI is idle. With *reduce motion* switched on in Windows, the bars stand still and the text alone shows the activity.

- **Beelink GTi12** (i9-12900HK, 32 GB, RTX 3050 6 GB): Quick for everyday checks, Thorough for important documents. Ollama uses the NVIDIA GPU automatically. Keep the NVIDIA driver up to date.
- **Lenovo L14 vPro** (no NVIDIA GPU): Light, or Rules-only. Quick also runs on the CPU, but expect it to be several times slower.

### Local AI only

All of CaseVault's AI is the **local** AI on this page: it runs on this PC and nothing leaves it. CaseVault has no online AI (v1.91 removed the optional online research page) and no in-browser fallback: when Ollama isn't running, the Consistency Checker uses its rule-based checks, and Ask AI and Draft with AI wait until you start the launcher.

## 5. Local network access prompt

When a CaseVault page first contacts the engine, Chrome/Edge may ask whether the site may **access other apps and services on this device**. Choose **Allow**. It covers this computer only. The page's built-in security policy still blocks every address except `127.0.0.1:11434`.

## 6. Keep it offline (optional hardening)

Once your models are downloaded, you can stop `ollama.exe` from making any internet connection. Run this in an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "CaseVault: block Ollama internet" -Direction Outbound `
  -Program "W:\ollama\ollama.exe" -Action Block
```

Temporarily disable that rule (Windows Security → Firewall → Advanced settings → Outbound Rules) when you want to `pull` a new model. Firewall rules are per PC, so repeat on each computer.

## 7. Updating

- **Helper and launcher:** copy the new `tools\Start-CaseVault.bat` and `tools\casevault-helper\` over the old ones on W:.
- **Left over from before v1.91:** `W:\webllm\` and `W:\Get-WebLLM-Model.bat` (the in-browser AI) are no longer used. Delete them to free the space.
- **Ollama:** close the launcher window, download the newer `ollama-windows-amd64.zip`, and replace the contents of `W:\ollama\`. Your models in `W:\models\` are untouched.
- **Models:** `W:\ollama\ollama.exe pull <model>` fetches the newest version. `W:\ollama\ollama.exe rm <model>` deletes one.

## Troubleshooting

| Problem | Fix |
|---|---|
| Launcher says *Could not find …casevault-helper.ps1* | Copy the `casevault-helper` folder next to `Start-CaseVault.bat` on W:. |
| *Port 8517 is already in use* | The helper is already running in another window. Use that one, or close it and start again. |
| *CASEVAULT drive not found yet* | Plug in the SSD and unlock V:. The helper picks it up by itself; then click **Reconnect** in CaseVault. |
| *App: not found* | Copy the app into `V:\CaseVault-App` (see USING-CASEVAULT.md). |
| *AI engine: not started* | `W:\ollama\ollama.exe` is missing. Extract the Ollama zip there. CaseVault still works, with rule-based checks only. |
| *Ollama is already running* | Quit the tray Ollama app (or end `ollama.exe` in Task Manager) and start the launcher again. |
| `pull` saves models to `C:\Users\…\.ollama` | The engine was started some other way. Close it and use the launcher. |
| Header says *AI: Offline* | Start the launcher, then click the pill → **Check again**. Until Ollama runs, checks use rules only. |
| Very slow on the Beelink | Run `W:\ollama\ollama.exe ps`. The *Processor* column should show GPU. Update the NVIDIA driver. Thorough is *meant* to be partly on the CPU. |
