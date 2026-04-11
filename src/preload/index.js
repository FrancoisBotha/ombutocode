const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('dropsync', {
  ping: () => 'pong'
})
