# CV-AI drive setup: launcher, helper and AI engine

The **CV-AI (W:)** partition holds everything CaseVault runs *next to* your data:

| On W: | What it is | Needed for |
|---|---|---|
| `Start-CaseVault.bat` | The launcher: double-click to start CaseVault | Firefox (always); AI review (any browser) |
| `casevault-helper\` | The CaseVault helper, a small local server | Firefox |
| `ollama\` | Portable [Ollama](https://ollama.com), the local AI engine | AI review in the Consistency Checker |
| `models\` | AI model files | AI review |
| `logs\` | Ollama's log files (created automatically) | — |

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
   CaseVault helper 1.5.0
   Vault     : V:\CaseVault-Data
   App       : V:\CaseVault-App
   AI engine : Ollama started, models in W:\models
   Address   : http://127.0.0.1:8517/  (this computer only)
   ```

3. Your default browser opens **http://127.0.0.1:8517/**. In Chrome or Edge you can also keep using the installed app; it will see the AI engine too.
4. **Keep the window open** while you work. Closing it stops both the helper and the AI engine.

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

### Choosing a profile

The header shows the engine status: **AI: Connected (Quick · qwen2.5:7b)**, **AI: Offline**, or **AI: Rules-only**. Click it to:

- see which models were found;
- pick **Auto** (Quick if installed, then Light, then Thorough), **Quick**, **Thorough**, **Light**, or **Rules-only**;
- **Check again** after starting the launcher.

The choice is stored in the vault (`vault.json`), so it follows the SSD.

- **Beelink GTi12** (i9-12900HK, 32 GB, RTX 3050 6 GB): Quick for everyday checks, Thorough for important documents. Ollama uses the NVIDIA GPU automatically. Keep the NVIDIA driver up to date.
- **Lenovo L14 vPro** (no NVIDIA GPU): Light, or Rules-only. Quick also runs on the CPU, but expect it to be several times slower.

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
| Header says *AI: Offline* | Start the launcher, then click the pill → **Check again**. |
| Very slow on the Beelink | Run `W:\ollama\ollama.exe ps`. The *Processor* column should show GPU. Update the NVIDIA driver. Thorough is *meant* to be partly on the CPU. |

### Not yet included: in-browser AI (WebLLM)

The spec also calls for a fallback that runs a small model **inside the browser** (WebLLM on WebGPU), with weights loaded from the SSD, for when Ollama isn't running. It is **not built yet**. For now, when Ollama isn't available, checks run with the rule-based layer only, and the results say so.
