const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  cashDrawer: {
    open: () => ipcRenderer.invoke('blossom-cash-drawer:open'),
  },
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, data) => callback(data)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_, data) => callback(data)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, data) => callback(data)),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  localModel: {
    status: () => ipcRenderer.invoke('blossom-local-model:status'),
    chat: (request) => ipcRenderer.invoke('blossom-local-model:chat', request),
    streamChat: (request, onToken) => new Promise((resolve, reject) => {
      const requestId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const cleanup = () => {
        ipcRenderer.removeListener('blossom-local-model:stream-chunk', handleChunk)
        ipcRenderer.removeListener('blossom-local-model:stream-done', handleDone)
        clearTimeout(timeout)
      }
      const handleChunk = (_event, payload) => {
        if (payload?.requestId === requestId && payload.content) onToken?.(payload.content)
      }
      const handleDone = (_event, payload) => {
        if (payload?.requestId !== requestId) return
        cleanup()
        if (payload.error) reject(new Error(payload.error))
        else resolve(payload.result)
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('The local model took too long to respond.'))
      }, Math.max(1000, Math.min(45_000, Number(request?.timeoutMs) || 12_000)) + 1000)
      ipcRenderer.on('blossom-local-model:stream-chunk', handleChunk)
      ipcRenderer.on('blossom-local-model:stream-done', handleDone)
      ipcRenderer.send('blossom-local-model:stream', { requestId, request })
    }),
  },
})
