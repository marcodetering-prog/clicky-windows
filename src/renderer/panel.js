const statusEl = document.getElementById('status');
const configEl = document.getElementById('config');
const inputEl = document.getElementById('input');
const sendEl = document.getElementById('send');
const outputEl = document.getElementById('output');
const hintEl = document.getElementById('hint');
const includeScreenshotEl = document.getElementById('includeScreenshot');

function setStatus(text) {
  statusEl.textContent = text;
}

function setHint(text) {
  hintEl.textContent = text;
}

async function boot() {
  const config = await window.clicky.getConfig();
  configEl.textContent = `backend: ${config.openAICompatibleBaseURL}\nmodel: ${config.model}\nhotkey: ${config.hotkey}`;
  setHint('tip: this scaffold uses Ctrl+Alt+Space (modifier-only hotkeys need a native hook).');
}

sendEl.addEventListener('click', async () => {
  const userText = inputEl.value.trim();
  if (!userText) return;

  sendEl.disabled = true;
  setStatus('thinking…');
  outputEl.textContent = '';

  try {
    const shouldIncludeScreenshot = Boolean(includeScreenshotEl?.checked);
    const screenshotDataUrl = shouldIncludeScreenshot
      ? await window.clicky.captureScreenshotDataUrl()
      : undefined;

    const { responseText } = await window.clicky.chat(userText, { screenshotDataUrl });
    outputEl.textContent = responseText;
    setStatus('ready');
  } catch (error) {
    outputEl.textContent = String(error?.message || error);
    setStatus('error');
  } finally {
    sendEl.disabled = false;
  }
});

window.clicky.onListeningChanged((isListening) => {
  setStatus(isListening ? 'listening…' : 'ready');
});

window.clicky.onPanelRequestScreenshot((requestId, screenshotDataUrl, errorMessage) => {
  window.clicky.sendPanelScreenshotResponse(requestId, screenshotDataUrl, errorMessage);
});

window.clicky.onPushToTalkResult(({ transcript, responseText }) => {
  if (transcript) {
    inputEl.value = transcript;
  }
  if (responseText) {
    outputEl.textContent = responseText;
  }
  setStatus('ready');
});

window.clicky.onPushToTalkError(({ errorMessage }) => {
  if (errorMessage) {
    outputEl.textContent = errorMessage;
  }
  setStatus('error');
});

boot().catch((error) => {
  outputEl.textContent = String(error?.message || error);
});
