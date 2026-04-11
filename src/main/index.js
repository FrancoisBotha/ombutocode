const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const jobManager = require('../../.ombutocode/src/src/main/jobManager')

function createWindow () {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'))
  }
}

ipcMain.handle('dropsync:getAppVersion', () => {
  return app.getVersion()
})

function toIpcResponse (handler) {
  return async (...args) => {
    try {
      const data = await handler(...args)
      return { ok: true, data }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

ipcMain.handle('jobs.list', toIpcResponse(() => jobManager.listJobs()))
ipcMain.handle('jobs.get', toIpcResponse((_event, id) => jobManager.getJob(id)))
ipcMain.handle('jobs.create', toIpcResponse((_event, job) => jobManager.createJob(job)))
ipcMain.handle('jobs.update', toIpcResponse((_event, id, fields) => jobManager.updateJob(id, fields)))
ipcMain.handle('jobs.delete', toIpcResponse((_event, id) => jobManager.deleteJob(id)))
ipcMain.handle('jobs.toggleEnabled', toIpcResponse((_event, id) => jobManager.toggleJobEnabled(id)))
ipcMain.handle('jobs.pickSourceFolder', toIpcResponse(async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
}))

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
