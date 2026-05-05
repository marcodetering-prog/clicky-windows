# Tech choices (pick one)

## Option A: Electron (recommended for v0)

Pros:
- Fast UI iteration.
- Built-in screen capture APIs.
- Global shortcuts are straightforward.

Cons:
- Heavier runtime footprint.

## Option B: Tauri

Pros:
- Smaller, more native footprint.

Cons:
- More native work required (global hooks, capture, audio).

## Option C: .NET (WPF/WinUI)

Pros:
- Native Windows ecosystem.

Cons:
- Harder cross-platform story; more Windows-specific UI/code.

