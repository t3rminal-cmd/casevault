# CV-AI drive setup: launcher, helper and AI engine

The **CV-AI (W:)** partition holds everything CaseVault runs *next to* your data:

| On W: | What it is | Needed for |
|---|---|---|
| `Start-CaseVault.bat` | The launcher: double-click to start CaseVault | Firefox (always); AI review (any browser) |
| `casevault-helper\` | The CaseVault helper, a small local server | Firefox |
| `ollama\` | Portable [Ollama](https://ollama.com), the local AI engine | AI review in the Consistency Checker |
| `models\` | AI model files | AI review |
| `logs\` | Ollama's log files (created automatically) | — |
| `webllm\` | Models for the in-browser AI fallback (optional, see section 8) | AI when Ollama isn't running |
| `Get-WebLLM-Model.bat` | Downloads an in-browser model into `webllm\` (one time) | Section 8 |

Everything runs on your own computer and **listens on 127.0.0.1 only**, so nothing on the network can connect to it. Nothing needs installing, and nothing needs admin rights.

Finish [SSD-SETUP.md](SSD-SETUP.md) first so that W: exists.

---

## 1. Copy the launcher and the helper to W:

From this repository (download it with **Code → Download ZIP** and extract it):

1. Copy `tools\Start-CaseVault.bat` to **`W:\Start-CaseVault.bat`**.
2. Copy the folder `tools\casevault-helper` to **`W:\casevault-helper`**.
3. Optional, for the in-browser AI (section 8): copy `tools\Get-WebLLM-Model.bat` to **`W:\Get-WebLLM-Model.bat`**.

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
   CaseVault helper 1.9.0
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

### Choosing a profile

The header shows the engine status: **AI: Connected (Quick · qwen2.5:7b)**, **AI: Offline**, or **AI: Rules-only**. Click it to:

- see which models were found;
- pick **Auto** (Quick if installed, then Light, then Thorough), **Quick**, **Thorough**, **Light**, or **Rules-only**;
- **Check again** after starting the launcher.

The choice is stored in the vault (`vault.json`), so it follows the SSD.

**Drafts** use the same engine. *Draft with AI* uses the model of the chosen profile. **AI suggestions while typing** always use the smallest installed chat model (Light if you have it). Install a Light model (`qwen2.5:3b`) even on the Beelink if you want snappy suggestions.

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

### Local AI vs. online AI

Everything on this page is the **local** AI: it runs on this PC and nothing leaves it. CaseVault 1.9 also has an optional **online** research & drafting page (Claude via claude.ai or the Anthropic API). It is off by default, never used by the consistency checker or the drafting copilot, and every message is reviewed and redacted first. See *Online research & drafting* in [USING-CASEVAULT.md](USING-CASEVAULT.md). If your policy is local-only, simply leave **Vault → Online features → Allow going online** unticked.

## 5. Local network access prompt

When a CaseVault page first contacts the engine, Chrome/Edge may ask whether the site may **access other apps and services on this device**. Choose **Allow**. It covers this computer only. The page's built-in security policy still blocks every address except `127.0.0.1:11434` (and `api.anthropic.com`, used only after you choose to go online).

## 6. Keep it offline (optional hardening)

Once your models are downloaded, you can stop `ollama.exe` from making any internet connection. Run this in an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "CaseVault: block Ollama internet" -Direction Outbound `
  -Program "W:\ollama\ollama.exe" -Action Block
```

Temporarily disable that rule (Windows Security → Firewall → Advanced settings → Outbound Rules) when you want to `pull` a new model. Firewall rules are per PC, so repeat on each computer.

## 7. Updating

- **Helper and launcher:** copy the new `tools\Start-CaseVault.bat`, `tools\Get-WebLLM-Model.bat` and `tools\casevault-helper\` over the old ones on W:.
- **In-browser models:** keep them unless the release notes say the bundled WebLLM changed version; then run `Get-WebLLM-Model.bat` again for your model.
- **Ollama:** close the launcher window, download the newer `ollama-windows-amd64.zip`, and replace the contents of `W:\ollama\`. Your models in `W:\models\` are untouched.
- **Models:** `W:\ollama\ollama.exe pull <model>` fetches the newest version. `W:\ollama\ollama.exe rm <model>` deletes one.

## 8. In-browser AI (fallback, no Ollama needed)

If Ollama isn't running (or isn't installed on a PC), CaseVault can still do AI review, suggestions and Draft with AI with a **small model that runs inside the browser** on the PC's graphics chip, using WebGPU and [WebLLM](https://github.com/mlc-ai/web-llm). It's the fallback, not a replacement. It's slower and less capable than Ollama, but needs nothing installed. It's handy on the **Lenovo L14**, whose Intel graphics usually run a 1.5B model faster than Ollama does on the CPU.

### What it needs

- CaseVault opened **through the launcher** (`W:\Start-CaseVault.bat`, address `http://127.0.0.1:8517/`), in any browser: Chrome, Edge or Firefox. The helper serves the model files from the SSD. The hosted/installed app opened *without* the launcher can't use the in-browser engine yet.
- A browser with **WebGPU**: a current Chrome or Edge, or Firefox 141 or newer on Windows, with an up-to-date graphics driver.
- A model on **W:** (next step).

### Download a model to W: (one time, needs internet)

1. Copy `tools\Get-WebLLM-Model.bat` to **`W:\Get-WebLLM-Model.bat`**, and make sure `W:\casevault-helper\` is up to date (it contains `Get-WebLLM-Model.ps1`).
2. On a PC with internet, double-click **`W:\Get-WebLLM-Model.bat`**. It downloads the default model into `W:\webllm\Qwen2.5-1.5B-Instruct-q4f16_1-MLC\`, with its files from Hugging Face and its compiled library from GitHub. If the download is interrupted, run it again: finished files are skipped.
3. For a different model, open a Command Prompt and run, for example:

   ```bat
   W:\Get-WebLLM-Model.bat -Model Qwen2.5-0.5B-Instruct-q4f16_1-MLC
   ```

| Model | Download | Graphics memory | Use it when |
|---|---|---|---|
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` *(default)* | ~1 GB | ~1.6 GB | Most PCs, including the L14's Intel graphics |
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | ~0.3 GB | ~1 GB | Older or weak graphics; lowest quality |
| `Llama-3.2-1B-Instruct-q4f16_1-MLC` | ~0.7 GB | ~0.9 GB | An alternative small model |
| `Qwen2.5-3B-Instruct-q4f16_1-MLC` / `Llama-3.2-3B-Instruct-q4f16_1-MLC` | ~1.7 GB | ~2.3–2.5 GB | Better answers, if the graphics chip has the memory |

### How it's used

- CaseVault always prefers **Ollama**. When Ollama isn't reachable and a model is in `W:\webllm`, the header shows **AI: Connected (In-browser · Qwen2.5-1.5B-Instruct)**.
- The model loads from the SSD on the first AI request (a check, a suggestion, or Draft with AI). A progress message shows while it loads, which takes up to a minute or two. It then stays in graphics memory until you close the tab.
- Click the **AI:** pill → **In-browser AI (fallback)** to switch it off, pick another installed model, or unload it.
- Retrieval uses keyword search (no embedding model in the browser), and the model's context is shorter (4,096 tokens), so very long drafts use fewer report passages.

### Privacy and the PC's disk

The model files are read from the SSD through the helper, on this computer only. The browser engine insists on copying what it loads into the browser's own storage, so CaseVault **deletes that copy as soon as the model is loaded**. The files are only on the PC's disk for the minute it takes to load. Case data never goes into that storage. As with Ollama, nothing is sent anywhere.

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
| Header says *AI: Offline* | Start the launcher, then click the pill → **Check again**. If Ollama isn't installed, add an in-browser model (section 8). |
| *In-browser AI could not start* | The model's files in `W:\webllm\<model>` are incomplete: run `Get-WebLLM-Model.bat` again. *Ran out of memory*: pick a smaller model under AI pill → In-browser AI. |
| In-browser section says *no WebGPU* | Update the browser and the graphics driver. In Firefox, WebGPU needs version 141 or newer on Windows. |
| In-browser section says *Open CaseVault through Start-CaseVault.bat* | The in-browser engine needs the launcher's address `http://127.0.0.1:8517/`. |
| Very slow on the Beelink | Run `W:\ollama\ollama.exe ps`. The *Processor* column should show GPU. Update the NVIDIA driver. Thorough is *meant* to be partly on the CPU. |
