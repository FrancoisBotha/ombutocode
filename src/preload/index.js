const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dropsync', {
  ping: () => 'pong',
  getAppVersion: () => ipcRenderer.invoke('dropsync:getAppVersion'),
  jobs: {
    listWithLatestRun: () => ipcRenderer.invoke('jobs:listWithLatestRun')
  }
})

contextBridge.exposeInMainWorld('api', {
  jobs: {
    list: () => ipcRenderer.invoke('jobs.list'),
    get: (id) => ipcRenderer.invoke('jobs.get', id),
    create: (job) => ipcRenderer.invoke('jobs.create', job),
    update: (id, fields) => ipcRenderer.invoke('jobs.update', id, fields),
    delete: (id) => ipcRenderer.invoke('jobs.delete', id),
    toggleEnabled: (id) => ipcRenderer.invoke('jobs.toggleEnabled', id),
    pickSourceFolder: () => ipcRenderer.invoke('jobs.pickSourceFolder')
  }
})
