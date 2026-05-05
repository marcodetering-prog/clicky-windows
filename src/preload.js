const { contextBridge, ipcRenderer, desktopCapturer, screen } = require('electron');

async function captureCursorDisplayScreenshotDataUrl() {
  const cursorPoint = screen.getCursorScreenPoint();
  const cursorDisplay = screen.getDisplayNearestPoint(cursorPoint);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 }
  });

  const sourceForCursorDisplay = sources.find((source) => source.display_id === String(cursorDisplay.id));
  const sourceToUse = sourceForCursorDisplay || sources[0];

  if (!sourceToUse) {
    throw new Error('No screen sources available for screenshot capture');
  }

  return sourceToUse.thumbnail.toDataURL();
}

contextBridge.exposeInMainWorld('clicky', {
  getConfig: () => ipcRenderer.invoke('clicky:getConfig'),
  chat: (userText, options) => ipcRenderer.invoke('clicky:chat', { userText, options }),
  captureScreenshotDataUrl: () => captureCursorDisplayScreenshotDataUrl(),
  onPanelRequestScreenshot: (handler) =>
    ipcRenderer.on('clicky:panelRequestScreenshot', async (_event, requestId) => {
      try {
        const screenshotDataUrl = await captureCursorDisplayScreenshotDataUrl();
        handler(requestId, screenshotDataUrl);
      } catch (error) {
        handler(requestId, null, String(error?.message || error));
      }
    }),
  sendPanelScreenshotResponse: (requestId, screenshotDataUrl, errorMessage) =>
    ipcRenderer.send('clicky:panelScreenshotResponse', { requestId, screenshotDataUrl, errorMessage }),
  onPushToTalkResult: (handler) =>
    ipcRenderer.on('panel:pushToTalkResult', (_event, payload) => handler(payload)),
  onPushToTalkError: (handler) =>
    ipcRenderer.on('panel:pushToTalkError', (_event, payload) => handler(payload)),
  onOverlayMessage: (handler) => ipcRenderer.on('overlay:setMessage', (_event, message) => handler(message)),
  onListeningChanged: (handler) => ipcRenderer.on('panel:setListening', (_event, isListening) => handler(isListening))
});
