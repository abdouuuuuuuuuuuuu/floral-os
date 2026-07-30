import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Auto Updater ───────────────────────────────────────────────────────────
// Enable logging (optional, remove in production)
autoUpdater.logger = console
autoUpdater.autoDownload = true      // Download silently in background
autoUpdater.autoInstallOnAppQuit = true  // Install when user closes app

const sendToWindow = (channel, data) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.webContents.send(channel, data)
}

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Checking for update...')
})

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Update available:', info.version)
  sendToWindow('update-available', info)
})

autoUpdater.on('update-not-available', () => {
  console.log('[Updater] App is up to date')
})

autoUpdater.on('download-progress', (progress) => {
  console.log(`[Updater] Download: ${Math.round(progress.percent)}%`)
  sendToWindow('update-progress', progress)
})

autoUpdater.on('update-downloaded', (info) => {
  console.log('[Updater] Update downloaded')
  sendToWindow('update-downloaded', info)
})

// Allow React to trigger "Install & Restart" immediately
ipcMain.on('quit-and-install', () => {
  autoUpdater.quitAndInstall(false, true) // isSilent, isForceRunAfter
})

// ─── Window ─────────────────────────────────────────────────────────────────
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'public', 'logo-Black.png'),
  })

  const isDev = process.env.VITE_DEV_SERVER_URL !== undefined

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Check for updates 3 seconds after window loads (not immediately, to avoid UI lag)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(console.error)
    }, 3000)
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})