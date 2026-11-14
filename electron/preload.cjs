const { contextBridge, ipcRenderer } = require('electron')

const subscribe = (channel, callback) => {
  const listener = (_event, data) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  receipt: {
    print: (request) => ipcRenderer.invoke('blossom-receipt:print', request),
  },
  loyaltyCards: {
    exportPdf: (request) => ipcRenderer.invoke('blossom-loyalty-cards:export-pdf', request),
  },
  cashDrawer: {
    open: () => ipcRenderer.invoke('blossom-cash-drawer:open'),
  },
  // Each returns a function that removes the listener, so a component that
  // subscribes on mount does not add another listener every time it mounts.
  onUpdateAvailable: (callback) => subscribe('update-available', callback),
  onUpdateProgress: (callback) => subscribe('update-progress', callback),
  onUpdateDownloaded: (callback) => subscribe('update-downloaded', callback),
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
