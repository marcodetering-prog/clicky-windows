const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clicky', {
  getConfig: () => ipcRenderer.invoke('clicky:getConfig'),
  chat: (userText) => ipcRenderer.invoke('clicky:chat', { userText }),
  onOverlayMessage: (handler) => ipcRenderer.on('overlay:setMessage', (_event, message) => handler(message)),
  onListeningChanged: (handler) => ipcRenderer.on('panel:setListening', (_event, isListening) => handler(isListening))
});

