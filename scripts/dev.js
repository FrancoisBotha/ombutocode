const { createServer } = require('vite')
const { spawn } = require('child_process')
const path = require('path')

async function start () {
  const server = await createServer({
    configFile: path.join(__dirname, '..', 'vite.config.js')
  })
  await server.listen()

  const address = server.httpServer.address()
  const url = `http://localhost:${address.port}`

  const electron = require('electron')
  const electronPath = typeof electron === 'string' ? electron : electron.default || electron

  const proc = spawn(electronPath, [path.join(__dirname, '..')], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url }
  })

  proc.on('close', () => {
    server.close()
    process.exit()
  })
}

start()
