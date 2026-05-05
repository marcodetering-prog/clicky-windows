# Architecture (draft)

## UX goals

- Always available via tray + hotkey.
- Cursor-adjacent overlay that can show status (listening/processing/responding).
- Voice-first interaction; no long UI flows.

## Core pipeline

1. Push-to-talk starts mic capture.
2. STT produces transcript (streaming if possible).
3. Capture screenshot(s) (at least cursor monitor).
4. Send transcript + screenshots to chat backend (OpenAI-compatible `POST /v1/chat/completions`).
5. Parse optional point tags from the response (e.g. `[POINT:x,y:label]`) and animate overlay cursor.
6. Speak response (TTS).

## Components

- UI shell: tray + panel + overlay
- Hotkey listener: global keyboard hooks
- Capture: screenshot + (optional) video frames
- Audio: mic capture + power meter
- STT provider: local (Windows Speech / Whisper) + optional cloud provider
- Chat provider: OpenAI-compatible (local/self-hosted models supported)
- TTS provider: SAPI / system voices (local) + optional cloud provider

