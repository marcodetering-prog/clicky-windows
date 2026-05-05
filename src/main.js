const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_OPENAI_COMPAT_BASE_URL = 'http://ai-coder:11434';
const DEFAULT_MODEL = 'qwen3.5:9b';

function getConfig() {
  return {
    openAICompatibleBaseURL: process.env.CLICKY_OPENAI_COMPAT_BASE_URL || DEFAULT_OPENAI_COMPAT_BASE_URL,
    model: process.env.CLICKY_MODEL || DEFAULT_MODEL,
    hotkey: process.env.CLICKY_HOTKEY || 'Control+Alt+Space'
  };
}

let tray = null;
let panelWindow = null;
let overlayWindow = null;
let isListening = false;

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    width: 360,
    height: 460,
    show: false,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  panelWindow.loadFile(path.join(__dirname, 'renderer', 'panel.html'));

  panelWindow.on('blur', () => {
    // Optional: keep it open; for now, hide when it loses focus
    if (panelWindow && panelWindow.isVisible()) {
      panelWindow.hide();
    }
  });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 260,
    height: 90,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
}

function showOverlayNearCursor(message) {
  if (!overlayWindow) return;

  const cursorPoint = screen.getCursorScreenPoint();
  const x = Math.round(cursorPoint.x + 14);
  const y = Math.round(cursorPoint.y + 14);

  overlayWindow.setPosition(x, y, false);
  if (!overlayWindow.isVisible()) {
    overlayWindow.showInactive();
  }
  overlayWindow.webContents.send('overlay:setMessage', message);
}

function hideOverlay() {
  if (!overlayWindow) return;
  overlayWindow.hide();
}

function togglePanel() {
  if (!panelWindow) return;
  if (panelWindow.isVisible()) {
    panelWindow.hide();
    return;
  }

  const trayBounds = tray.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - 180);
  const y = Math.round(trayBounds.y + trayBounds.height + 8);

  panelWindow.setPosition(x, y, false);
  panelWindow.show();
  panelWindow.focus();
}

async function openAICompatibleChat({ userText, screenshotDataUrl }) {
  const config = getConfig();

  const url = new URL('/v1/chat/completions', config.openAICompatibleBaseURL).toString();
  const userContent = screenshotDataUrl
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: screenshotDataUrl } }
      ]
    : userText;

  const body = {
    model: config.model,
    stream: false,
    messages: [{ role: 'user', content: userContent }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chat error (${response.status}): ${text}`);
  }

  const json = await response.json();
  const message = json?.choices?.[0]?.message?.content;
  if (typeof message !== 'string') {
    throw new Error('Invalid chat response format');
  }

  return message;
}

function speakWithWindowsTTS(text) {
  if (!text || !text.trim()) return;

  const powershellCommand = [
    '$ErrorActionPreference = "Stop";',
    'Add-Type -AssemblyName System.Speech;',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
    '$synth.Rate = 0;',
    '$synth.Volume = 100;',
    '$inputText = [Console]::In.ReadToEnd();',
    '$synth.Speak($inputText);'
  ].join(' ');

  const child = spawn('powershell', ['-NoProfile', '-Command', powershellCommand], {
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true
  });

  child.stdin.write(text);
  child.stdin.end();
}

function setListeningState(nextIsListening) {
  isListening = nextIsListening;
  if (isListening) {
    showOverlayNearCursor('listening…');
  } else {
    showOverlayNearCursor('ready');
    setTimeout(() => hideOverlay(), 700);
  }
  if (panelWindow) {
    panelWindow.webContents.send('panel:setListening', isListening);
  }
}

function registerHotkey() {
  const config = getConfig();
  const ok = globalShortcut.register(config.hotkey, () => {
    setListeningState(!isListening);
  });

  if (!ok) {
    console.error(`Failed to register hotkey: ${config.hotkey}`);
  }
}

function createTray() {
  // Placeholder 1x1 PNG. For real packaging we’ll add a proper .ico.
  const placeholderTrayIconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO1v0foAAAAASUVORK5CYII=';
  const trayIcon = nativeImage.createFromDataURL(`data:image/png;base64,${placeholderTrayIconBase64}`);
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open', click: () => togglePanel() },
    { type: 'separator' },
    { label: 'Show Overlay', click: () => showOverlayNearCursor('ready') },
    { label: 'Hide Overlay', click: () => hideOverlay() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);

  tray.setToolTip('Clicky');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => togglePanel());
}

function wireIpc() {
  ipcMain.handle('clicky:getConfig', () => getConfig());
  ipcMain.handle('clicky:chat', async (_event, { userText, options }) => {
    const screenshotDataUrl = options?.screenshotDataUrl;
    const responseText = await openAICompatibleChat({ userText, screenshotDataUrl });
    showOverlayNearCursor('speaking…');
    speakWithWindowsTTS(responseText);
    return { responseText };
  });
}

app.whenReady().then(() => {
  createPanelWindow();
  createOverlayWindow();
  createTray();
  wireIpc();
  registerHotkey();
  showOverlayNearCursor('ready');
  setTimeout(() => hideOverlay(), 700);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
