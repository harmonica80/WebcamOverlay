const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  getState: () => ipcRenderer.invoke('get-state'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  setMode: mode => ipcRenderer.send('set-mode', mode),
  saveSources: data => ipcRenderer.send('save-sources', data),
  saveOptions: data => ipcRenderer.send('save-options', data),
  saveHotkeys: data => ipcRenderer.invoke('save-hotkeys', data),
  overlayClick: index => ipcRenderer.send('overlay-click', index),
  dragStart: data => ipcRenderer.send('drag-start', data),
  moveOverlay: data => ipcRenderer.send('move-overlay', data),
  dragEnd: index => ipcRenderer.send('drag-end', index),
  resizeOverlay: data => ipcRenderer.send('resize-overlay', data),
  onSourceChanged: fn => ipcRenderer.on('source-changed', (_e, data) => fn(data)),
  onOptionsChanged: fn => ipcRenderer.on('options-changed', (_e, data) => fn(data)),
  onVisibilityChanged: fn => ipcRenderer.on('visibility-changed', (_e, visible) => fn(visible)),
  onStateChanged: fn => ipcRenderer.on('state-changed', (_e, data) => fn(data))
});
