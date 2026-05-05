# Clicky for Windows

Goal: a Windows companion app that lives near your cursor, can see your screen, listen/talk, and optionally point at UI elements.

This repo is the Windows port companion to the macOS version in `marcodetering-prog/clicky`.

## Initial scope (v0)

- Tray app (no taskbar window)
- Always-on-top overlay window (transparent or borderless)
- Global push-to-talk hotkey
- Screenshot capture (single monitor first, then multi-monitor)
- Chat backend: OpenAI-compatible endpoint (works with local/self-hosted models)
- STT: Windows local (TBD; start with Windows Speech or Whisper)
- TTS: Windows local (SAPI / Windows TTS)

## Architecture

See `docs/ARCHITECTURE.md`.

## Development

This repo currently uses **Electron** (tray + overlay + OpenAI-compatible chat + Windows TTS).

### Prereqs

- Node.js 18+
- Windows 10/11

### Run

```bash
npm install
npm start
```

### Configure

Environment variables:
- `CLICKY_OPENAI_COMPAT_BASE_URL` (default: `http://ai-coder:11434`)
- `CLICKY_MODEL` (default: `qwen3.5:9b`)
- `CLICKY_HOTKEY` (default: `Control+Alt+Space`)

Notes:
- Electron’s built-in hotkey API cannot bind modifier-only keys (so we use `Ctrl+Alt+Space`).
- TTS is local via Windows SAPI (PowerShell + `System.Speech`).
- Screenshots are supported and are sent to the model as `image_url` (OpenAI-compatible vision).
- STT is local via Windows Speech Recognition (`System.Speech.Recognition`) and is triggered by the hotkey.

STT environment variables:
- `CLICKY_STT_LOCALE` (default: `en-US`)
