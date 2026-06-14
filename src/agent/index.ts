import { CommandMode } from '@/types'
import type { ChatCompletionStreamEvent } from '@/electron.d.ts'

function waitForChatStream(
  conversationId: string,
  message: string,
  mode: CommandMode,
  onThinking: (chunk: string, complete: boolean) => void,
  onChunk: (chunk: string) => void,
  onReplace?: (content: string) => void,
  signal?: AbortSignal
): Promise<{ thinking: string; text: string }> {
  return new Promise((resolve, reject) => {
    let thinking = ''
    let text = ''
    const requestId = crypto.randomUUID()
    let cleanup: ((cancel?: boolean) => void) | undefined
    let settled = false

    const settle = (result: { thinking: string; text: string } | Error, cancel = false) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      cleanup?.(cancel)
      if (result instanceof Error) {
        reject(result)
      } else {
        resolve(result)
      }
    }

    const abort = () => settle(new Error('已取消'), true)
    signal?.addEventListener('abort', abort, { once: true })

    cleanup = window.electronAPI.chatCompletionStream(
      requestId,
      message,
      { conversationId, mode },
      (event: ChatCompletionStreamEvent) => {
        if (settled) return

        if (event.type === 'thinking') {
          const chunk = event.chunk || ''
          thinking += chunk
          onThinking(chunk, false)
          return
        }

        if (event.type === 'thinking_done') {
          onThinking('', true)
          return
        }

        if (event.type === 'text') {
          const chunk = event.chunk || ''
          text += chunk
          onChunk(chunk)
          return
        }

        if (event.type === 'replace_text') {
          text = event.chunk || ''
          onReplace?.(text)
          return
        }

        if (event.type === 'error') {
          settle(new Error(event.error || '请求失败'))
          return
        }

        if (event.type === 'done') {
          settle({ thinking, text })
        }
      }
    )

    if (signal?.aborted) abort()
  })
}

export async function executeAgentStream(
  conversationId: string,
  message: string,
  mode: CommandMode,
  onThinking: (chunk: string, complete: boolean) => void,
  onChunk: (chunk: string) => void,
  onReplace?: (content: string) => void,
  signal?: AbortSignal
): Promise<{ thinking: string; text: string }> {
  if (typeof window === 'undefined' || !window.electronAPI?.chatCompletionStream) {
    const msg = '当前环境不支持 LLM 请求'
    onChunk(msg)
    return { thinking: '', text: msg }
  }

  try {
    if (signal?.aborted) throw new Error('已取消')
    return await waitForChatStream(conversationId, message, mode, onThinking, onChunk, onReplace, signal)
  } catch (e) {
    if (e instanceof Error && e.message === '已取消') throw e
    const msg = e instanceof Error ? e.message : String(e)
    const errorMsg = `请求失败: ${msg}`
    onChunk(errorMsg)
    return { thinking: '', text: errorMsg }
  }
}

export function resetAgent() {
  // LLM state lives in the Electron main process and reads config per request.
}
