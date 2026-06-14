import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { ChatStreamPayload } from '@/shared/ipc'
import { APPROVAL_TTL_MS } from './constants'

export function sendChatStreamEvent(sender: WebContents, requestId: string, payload: ChatStreamPayload): void {
  if (!sender.isDestroyed()) {
    sender.send(`chat-completion-stream:${requestId}`, payload)
  }
}

export function requestCommandApproval(
  sender: WebContents,
  requestId: string,
  command: string,
  reason: string,
  signal: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    const approvalId = randomUUID()
    const responseChannel = `chat-command-approval-response:${requestId}:${approvalId}`
    const timeout = setTimeout(() => {
      cleanup()
      resolve(false)
    }, APPROVAL_TTL_MS)

    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      ipcMain.removeAllListeners(responseChannel)
    }

    const abort = () => {
      cleanup()
      resolve(false)
    }

    ipcMain.once(responseChannel, (_event, approved: boolean) => {
      cleanup()
      resolve(Boolean(approved))
    })

    signal.addEventListener('abort', abort, { once: true })
    sendChatStreamEvent(sender, requestId, {
      type: 'approval_required',
      approvalId,
      command,
      reason
    })
  })
}
