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

This repo starts with docs + scaffolding. Choose an implementation path in `docs/TECH-CHOICES.md`:
- Electron (fastest to ship; good desktopCapture + globalShortcut)
- Tauri (leaner; more native work in Rust)
- .NET (WPF/WinUI; native but more Windows-specific)

