const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_OPENAI_COMPAT_BASE_URL = 'http://ai-coder:11434';
const DEFAULT_MODEL = 'qwen3.5:9b';
const DEFAULT_STT_LOCALE = 'en-US';

function getConfig() {
  return {
    openAICompatibleBaseURL: process.env.CLICKY_OPENAI_COMPAT_BASE_URL || DEFAULT_OPENAI_COMPAT_BASE_URL,
    model: process.env.CLICKY_MODEL || DEFAULT_MODEL,
    hotkey: process.env.CLICKY_HOTKEY || 'Control+Alt+Space',
    sttLocale: process.env.CLICKY_STT_LOCALE || DEFAULT_STT_LOCALE
  };
}

let tray = null;
let panelWindow = null;
let overlayWindow = null;
let isListening = false;
let activeSpeechRecognitionProcess = null;
const pendingScreenshotRequestsById = new Map();

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

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function requestScreenshotDataUrlFromPanel() {
  if (!panelWindow) return null;

  const requestId = createRequestId();

  const screenshotPromise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingScreenshotRequestsById.delete(requestId);
      resolve(null);
    }, 3500);

    pendingScreenshotRequestsById.set(requestId, (payload) => {
      clearTimeout(timeout);
      pendingScreenshotRequestsById.delete(requestId);
      if (payload?.screenshotDataUrl) {
        resolve(payload.screenshotDataUrl);
      } else {
        resolve(null);
      }
    });
  });

  panelWindow.webContents.send('clicky:panelRequestScreenshot', requestId);
  return screenshotPromise;
}

function startWindowsSpeechRecognitionOnce() {
  const config = getConfig();

  const powershellScript = [
    '$ErrorActionPreference = "Stop";',
    'Add-Type -AssemblyName System.Speech;',
    `$culture = New-Object System.Globalization.CultureInfo("${config.sttLocale}");`,
    '$recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture);',
    '$recognizer.SetInputToDefaultAudioDevice();',
    '$grammar = New-Object System.Speech.Recognition.DictationGrammar;',
    '$recognizer.LoadGrammar($grammar);',
    '$recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(6);',
    '$recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(10);',
    '$recognizer.EndSilenceTimeout = [TimeSpan]::FromSeconds(0.7);',
    '$recognizer.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1.2);',
    '$result = $recognizer.Recognize();',
    'if ($null -eq $result) { exit 0 }',
    '$text = $result.Text;',
    'Write-Output $text;'
  ].join(' ');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', powershellScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    activeSpeechRecognitionProcess = child;

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('exit', (code) => {
      if (activeSpeechRecognitionProcess === child) {
        activeSpeechRecognitionProcess = null;
      }

      const transcript = stdout.trim();

      if (code === 0) {
        resolve(transcript || null);
        return;
      }

      reject(new Error(`STT failed (exit ${code}): ${stderr.trim() || 'unknown error'}`));
    });

    child.on('error', (error) => {
      if (activeSpeechRecognitionProcess === child) {
        activeSpeechRecognitionProcess = null;
      }
      reject(error);
    });
  });
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

async function startPushToTalkFlow() {
  setListeningState(true);
  try {
    const transcript = await startWindowsSpeechRecognitionOnce();
    setListeningState(false);

    if (!transcript) {
      showOverlayNearCursor('no speech detected');
      setTimeout(() => hideOverlay(), 900);
      return;
    }

    showOverlayNearCursor('thinking…');
    const screenshotDataUrl = await requestScreenshotDataUrlFromPanel();

    const responseText = await openAICompatibleChat({
      userText: transcript,
      screenshotDataUrl
    });

    showOverlayNearCursor('speaking…');
    speakWithWindowsTTS(responseText);

    if (panelWindow) {
      panelWindow.webContents.send('panel:pushToTalkResult', {
        transcript,
        responseText
      });
    }
  } catch (error) {
    setListeningState(false);
    showOverlayNearCursor('stt error');
    setTimeout(() => hideOverlay(), 900);
    if (panelWindow) {
      panelWindow.webContents.send('panel:pushToTalkError', {
        errorMessage: String(error?.message || error)
      });
    }
  }
}

function stopPushToTalkFlow() {
  if (activeSpeechRecognitionProcess) {
    try {
      activeSpeechRecognitionProcess.kill();
    } catch {
      // ignore
    }
  }
  setListeningState(false);
}

function registerHotkey() {
  const config = getConfig();
  const ok = globalShortcut.register(config.hotkey, () => {
    if (isListening) {
      stopPushToTalkFlow();
      return;
    }
    startPushToTalkFlow();
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

  ipcMain.on('clicky:panelScreenshotResponse', (_event, payload) => {
    const handler = pendingScreenshotRequestsById.get(payload?.requestId);
    if (handler) {
      handler(payload);
    }
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
