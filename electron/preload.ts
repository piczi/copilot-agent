import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getStoreValue: (key: string) => ipcRenderer.invoke('get-store-value', key),
  setStoreValue: (key: string, value: unknown) => ipcRenderer.invoke('set-store-value', key, value),
  getLLMConfig: () => ipcRenderer.invoke('get-llm-config'),
  saveLLMConfig: (config: unknown) => ipcRenderer.invoke('save-llm-config', config),
  testLLMConfig: (config: unknown) => ipcRenderer.invoke('test-llm-config', config),
  chatCompletion: (message: string) => ipcRenderer.invoke('chat-completion', message),
  chatCompletionStream: (
    requestId: string,
    message: string,
    onEvent: (event: unknown) => void
  ) => {
    const channel = `chat-completion-stream:${requestId}`
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => onEvent(payload)
    ipcRenderer.on(channel, listener)
    ipcRenderer.send('chat-completion-stream', requestId, message)

    return (cancel = false) => {
      ipcRenderer.removeListener(channel, listener)
      if (cancel) {
        ipcRenderer.send('chat-completion-stream-cancel', requestId)
      }
    }
  },
  execCommand: (command: string, options?: unknown) => ipcRenderer.invoke('exec-command', command, options),
})
