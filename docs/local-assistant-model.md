# Blossom local language model

Blossom can use [Ollama](https://ollama.com/download/windows) as an optional, on-device language layer. Blossom rules route well-understood requests directly. When wording is unclear, Ollama can select one of Blossom's allowlisted tools; Blossom validates the selection, reads live Supabase data, and keeps changes behind its existing role checks and review UI. For model-routed read requests, the local model receives the structured result to write a short response; the result cards and deterministic answer remain available if that wording step fails.

## Windows setup

1. Install Ollama from the official Windows download page and start it.
2. In PowerShell, download a tool-capable model:

   ```powershell
   ollama pull qwen3:4b
   ```

3. Open Blossom, open the assistant, select **Local model settings**, and click **Check**. Choose the installed model from the list.

The app talks only to Ollama at `127.0.0.1:11434`. It does not need an API key, and prompts are not sent to a hosted model. If Ollama is unavailable, the existing Blossom intent rules remain active.

Model performance depends on the computer's available memory and processor. The 4B model is a practical starting point; a larger model may respond more capably but needs more resources.

See [assistant architecture](assistant-architecture.md) for the routing, data, conversation, and action boundaries.
