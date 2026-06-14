import { contextBridge, ipcRenderer } from 'electron'

function applyPlatformAttributes() {
  document.documentElement.dataset.platform = process.platform
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', applyPlatformAttributes)
} else {
  applyPlatformAttributes()
}

contextBridge.exposeInMainWorld('electronAPI', {
  getStoreValue: (key: string) => ipcRenderer.invoke('get-store-value', key),
  setStoreValue: (key: string, value: unknown) => ipcRenderer.invoke('set-store-value', key, value),
  getLLMConfig: () => ipcRenderer.invoke('get-llm-config'),
  saveLLMConfig: (config: unknown) => ipcRenderer.invoke('save-llm-config', config),
  testLLMConfig: (config: unknown) => ipcRenderer.invoke('test-llm-config', config),
  listConversations: () => ipcRenderer.invoke('list-conversations'),
  getConversationMessages: (conversationId: string) => ipcRenderer.invoke('get-conversation-messages', conversationId),
  createConversation: () => ipcRenderer.invoke('create-conversation'),
  deleteConversation: (conversationId: string) => ipcRenderer.invoke('delete-conversation', conversationId),
  touchConversation: (conversationId: string, message: string) => ipcRenderer.invoke('touch-conversation', conversationId, message),
  chatCompletionStream: (
    requestId: string,
    message: string,
    options: { conversationId: string; mode?: string } | undefined,
    onEvent: (event: unknown) => void
  ) => {
    const channel = `chat-completion-stream:${requestId}`
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
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
  respondCommandApproval: (requestId: string, approvalId: string, approved: boolean) => {
    ipcRenderer.send(`chat-command-approval-response:${requestId}:${approvalId}`, approved)
  },
  execCommand: (command: string, options?: unknown) => ipcRenderer.invoke('exec-command', command, options),
})
