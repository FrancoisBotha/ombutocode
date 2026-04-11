const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dropsync', {
  ping: () => 'pong',
  getAppVersion: () => ipcRenderer.invoke('dropsync:getAppVersion')
})
