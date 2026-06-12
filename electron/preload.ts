import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getStoreValue: (key: string) => ipcRenderer.invoke('get-store-value', key),
  setStoreValue: (key: string, value: unknown) => ipcRenderer.invoke('set-store-value', key, value),
  getLLMConfig: () => ipcRenderer.invoke('get-llm-config'),
  saveLLMConfig: (config: unknown) => ipcRenderer.invoke('save-llm-config', config),
  testLLMConfig: (config: unknown) => ipcRenderer.invoke('test-llm-config', config),
  chatCompletion: (message: string, options?: unknown) => ipcRenderer.invoke('chat-completion', message, options),
  chatCompletionStream: (
    requestId: string,
    message: string,
    options: { mode?: string; history?: unknown[] } | undefined,
    onEvent: (event: unknown) => void
  ) => {
    const channel = `chat-completion-stream:${requestId}`
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (
        payload &&
        typeof payload === 'object' &&
        (payload as { type?: string }).type === 'approval_required'
      ) {
        const approval = payload as { approvalId?: string; command?: string; reason?: string }
        const approved = window.confirm(`受限模式下该命令需要审批：\n\n${approval.command || ''}\n\n原因：${approval.reason || '命令存在风险'}\n\n是否继续执行？`)
        if (approval.approvalId) {
          ipcRenderer.send(`chat-command-approval-response:${requestId}:${approval.approvalId}`, approved)
        }
        return
      }
      onEvent(payload)
    }
    ipcRenderer.on(channel, listener)
    ipcRenderer.send('chat-completion-stream', requestId, message, options)

    return (cancel = false) => {
      ipcRenderer.removeListener(channel, listener)
      if (cancel) {
        ipcRenderer.send('chat-completion-stream-cancel', requestId)
      }
    }
  },
  execCommand: (command: string, options?: unknown) => ipcRenderer.invoke('exec-command', command, options),
})
