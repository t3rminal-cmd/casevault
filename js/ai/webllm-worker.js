// CaseVault — runs the in-browser AI model (WebLLM) off the main thread so the page stays responsive.
// Loaded as a module worker from this site only; the model files come from the SSD via the helper.
import { WebWorkerMLCEngineHandler } from '../../vendor/webllm/web-llm.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
