const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gk', {
  shot: () => ipcRenderer.invoke('gk-shot'),
  win: what => ipcRenderer.invoke('gk-win', what)
});
