const { contextBridge, ipcRenderer } = require('electron')

const runEventChannels = ['runs:started', 'runs:completed', 'runs:failed']

contextBridge.exposeInMainWorld('dropsync', {
  ping: () => 'pong',
  getAppVersion: () => ipcRenderer.invoke('dropsync:getAppVersion'),
  jobs: {
    listWithLatestRun: () => ipcRenderer.invoke('jobs:listWithLatestRun')
  },
  runs: {
    runNow: (jobId) => ipcRenderer.invoke('runs.runNow', jobId),
    onRunEvent: (callback) => {
      const handlers = {}
      for (const channel of runEventChannels) {
        const handler = (_event, data) => callback(channel, data)
        ipcRenderer.on(channel, handler)
        handlers[channel] = handler
      }
      return () => {
        for (const channel of runEventChannels) {
          ipcRenderer.removeListener(channel, handlers[channel])
        }
      }
    }
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
    pickSourceFolder: () => ipcRenderer.invoke('jobs.pickSourceFolder'),
    listExclusionRules: (jobId) => ipcRenderer.invoke('jobs.listExclusionRules', jobId),
    listDefaultExclusionPatterns: () => ipcRenderer.invoke('jobs.listDefaultExclusionPatterns')
  },
  logs: {
    listRuns: (filters, pagination) => ipcRenderer.invoke('logs.listRuns', filters, pagination),
    getRun: (runId) => ipcRenderer.invoke('logs.getRun', runId),
    listFiles: (runId, options) => ipcRenderer.invoke('logs.listFiles', runId, options),
    listEntries: (runId, options) => ipcRenderer.invoke('logs.listEntries', runId, options)
  }
})
