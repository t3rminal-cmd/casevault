# AI engine setup (for the v1.5 Consistency Checker)

> **Status:** CaseVault **v1** does not use AI yet. The Offline Consistency Checker arrives in **v1.5**. You can prepare the engine now so it's ready. Everything here runs on your own computer from the **CV-AI (W:)** partition. After the one-time downloads below, nothing needs the internet.

CaseVault will use **[Ollama](https://ollama.com)**, a free program that runs AI models locally. We use the *portable* version: the program and its models live on the SSD, not on the PC. It listens only on `127.0.0.1` (this computer), and CaseVault is only allowed to talk to `localhost`.

Finish [SSD-SETUP.md](SSD-SETUP.md) first so that W: exists.

---

## 1. Put portable Ollama on W:

Do this on a PC with internet. It's a one-time download.

1. Go to **https://github.com/ollama/ollama/releases/latest**.
2. Under *Assets*, download **`ollama-windows-amd64.zip`**. This is the standalone build. Don't use `OllamaSetup.exe`, which installs to the PC's internal drive.
3. Extract the zip into **`W:\ollama\`** so that this file exists: `W:\ollama\ollama.exe`.
4. Copy **`tools\Start-CaseVault-AI.bat`** from this repository to **`W:\Start-CaseVault-AI.bat`**.
5. Create an empty folder **`W:\models\`**. The launcher also creates it if it's missing.

> If the regular Ollama app is installed on a PC, quit it from the system tray (llama icon → *Quit*) before using the launcher. Better still, uninstall it so it can't start with Windows and store models on the internal drive.

## 2. Start the engine

Double-click **`W:\Start-CaseVault-AI.bat`**. A window opens and stays open while the engine runs. Close it to stop the engine.

The launcher:

| Setting | Value | Why |
|---|---|---|
| `OLLAMA_MODELS` | `<this drive>\models` | Models are stored on the SSD, not in your user profile. |
| `OLLAMA_HOST` | `127.0.0.1:11434` | Only this computer can reach the engine. |
| `OLLAMA_ORIGINS` | `https://t3rminal-cmd.github.io` | Lets the hosted CaseVault page call the engine; other websites are refused. |
| `OLLAMA_KEEP_ALIVE` | `10m` | Frees GPU memory 10 minutes after the last use. |

It works out its own drive letter, so it still works if W: becomes another letter.

If Windows Defender Firewall asks about `ollama.exe`, click **Cancel** or deny it. The engine only needs to reach this computer, not your network.

Check it's running by opening PowerShell and running:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/version
```

## 3. Download models to W:

With the engine running, open **a second** Command Prompt and run the `pull` commands below. The engine saves the models into `W:\models` because the launcher told it to. Adjust `W:` if your letter differs.

CaseVault v1.5 will offer four **AI profiles** and only show the ones whose models are installed:

| Profile | Size class | Runs on | Suggested model | Download |
|---|---|---|---|---|
| **Quick** | ~7–8B | Beelink GTi12. Fits fully in the RTX 3050's 6 GB of VRAM. | `qwen2.5:7b` *(or `llama3.1:8b`)* | ~4.7 GB |
| **Thorough** | ~12–14B | Beelink. Split between the GPU and 32 GB of RAM, slower but more careful. | `qwen2.5:14b` *(or `gemma3:12b`)* | ~9 GB |
| **Light** | ~3–4B | Lenovo L14. CPU only. | `qwen2.5:3b` *(or `llama3.2:3b`)* | ~2 GB |
| **Rules-only** | none | Anywhere | *(no model; the rule-based checks always work)* | — |

The v1.5 retrieval step also uses a small embedding model to find the report passages relevant to each statement:

| Purpose | Model | Download |
|---|---|---|
| Passage search | `nomic-embed-text` | ~0.3 GB |

Example, for everything:

```bat
W:\ollama\ollama.exe pull qwen2.5:7b
W:\ollama\ollama.exe pull qwen2.5:14b
W:\ollama\ollama.exe pull qwen2.5:3b
W:\ollama\ollama.exe pull nomic-embed-text
W:\ollama\ollama.exe list
```

About 16 GB in total, which fits comfortably on the 150 GB partition. The model names are good choices today; newer models of the same size work too, and v1.5's Settings screen will list whatever you've installed.

A quick smoke test (this takes a few seconds the first time, while the model loads into memory):

```bat
W:\ollama\ollama.exe run qwen2.5:7b "Reply with the word ready."
```

### Which PC uses what

- **Beelink GTi12** (i9-12900HK, 32 GB, RTX 3050 6 GB): Quick for everyday checks, Thorough for important documents. Ollama uses the NVIDIA GPU automatically. Keep the NVIDIA driver up to date.
- **Lenovo L14 vPro** (no NVIDIA GPU): Light, or Rules-only. Quick also runs on the CPU, but expect it to be several times slower.

## 4. Using the hosted page with the local engine

When the hosted CaseVault (`https://t3rminal-cmd.github.io/casevault/`) first contacts the engine, Chrome/Edge may ask whether the site may **access other apps and services on this device** (the local network access prompt). Choose **Allow**. That permission covers `localhost` only. The page is still blocked from contacting any other address by its built-in security policy.

## 5. Keep it offline (optional hardening)

Once your models are downloaded, you can stop `ollama.exe` from making any internet connection at all. Run this in an **administrator** PowerShell, adjusting the letter if needed:

```powershell
New-NetFirewallRule -DisplayName "CaseVault: block Ollama internet" -Direction Outbound `
  -Program "W:\ollama\ollama.exe" -Action Block
```

Temporarily disable that rule (Windows Security → Firewall → Advanced settings → Outbound Rules) when you want to `pull` a new model. Firewall rules are per PC, so repeat on each computer.

## 6. Updating

- **Ollama:** quit the launcher window, download the newer `ollama-windows-amd64.zip`, and replace the contents of `W:\ollama\`. Your models in `W:\models\` are untouched.
- **Models:** `W:\ollama\ollama.exe pull <model>` again fetches the newest version. `W:\ollama\ollama.exe rm <model>` deletes one you no longer want.

## Troubleshooting

| Problem | Fix |
|---|---|
| Launcher says *Could not find ollama.exe* | Extract the zip so the file is at `W:\ollama\ollama.exe`, not `W:\ollama\ollama-windows-amd64\ollama.exe`. |
| Launcher says *already running* | Quit the tray Ollama app, or end `ollama.exe` in Task Manager, and run the launcher again. |
| `pull` saves models to `C:\Users\…\.ollama` | The engine was started some other way. Close it and start it with the launcher. |
| Very slow on the Beelink | Check `W:\ollama\ollama.exe ps`. The *Processor* column should show GPU. Update the NVIDIA driver. Thorough is *meant* to be partly on the CPU. |
| Out-of-memory errors | Use a smaller profile, or close other GPU-heavy apps. |
| *Address already in use* | Another program uses port 11434, usually another Ollama. Quit it. |

### WebLLM fallback (v1.5)

v1.5 will also be able to run a small model **inside the browser** (WebLLM, using WebGPU) when Ollama isn't running, with the model files loaded from the SSD. No setup is needed for that yet. If no AI engine is available at all, the rule-based checks still run.
