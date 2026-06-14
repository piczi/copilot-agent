import { useCallback } from 'react'
import { executeAgentStream } from '@/agent'
import { useChatStore } from '@/store/chatStore'
import { Message } from '@/types'

const STREAM_FLUSH_INTERVAL_MS = 48

function createStreamBuffer(flushChunk: (chunk: string) => void) {
  let queued = ''
  let timeoutId: ReturnType<typeof window.setTimeout> | null = null
  let frameId: number | null = null

  const flush = () => {
    if (queued.length === 0) return
    const chunk = queued
    queued = ''
    flushChunk(chunk)
  }

  const clearScheduledFlush = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  const scheduleFlush = () => {
    if (timeoutId !== null || frameId !== null) return

    timeoutId = window.setTimeout(() => {
      timeoutId = null
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        flush()
      })
    }, STREAM_FLUSH_INTERVAL_MS)
  }

  return {
    append(chunk: string) {
      if (!chunk) return
      queued += chunk
      scheduleFlush()
    },
    flushNow() {
      clearScheduledFlush()
      flush()
    }
  }
}

export function useSendMessage() {
  const inputText = useChatStore((s) => s.inputText)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const commandMode = useChatStore((s) => s.commandMode)
  const setInputText = useChatStore((s) => s.setInputText)
  const addMessage = useChatStore((s) => s.addMessage)
  const addStreamingMessage = useChatStore((s) => s.addStreamingMessage)
  const appendToMessage = useChatStore((s) => s.appendToMessage)
  const appendToThinking = useChatStore((s) => s.appendToThinking)
  const setThinkingComplete = useChatStore((s) => s.setThinkingComplete)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const setLoading = useChatStore((s) => s.setLoading)
  const isLoading = useChatStore((s) => s.isLoading)
  const setAbortController = useChatStore((s) => s.setAbortController)
  const touchConversation = useChatStore((s) => s.touchConversation)

  return useCallback(
    async () => {
      const trimmed = inputText.trim()
      if (!trimmed || isLoading) return
      const conversationId = activeConversationId
      if (!conversationId) return

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now()
      }
      addMessage(userMsg)
      setInputText('')
      void touchConversation(conversationId, trimmed)

      const assistantMsgId = crypto.randomUUID()
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      }
      addStreamingMessage(assistantMsg)

      const controller = new AbortController()
      setAbortController(controller)
      const contentBuffer = createStreamBuffer((chunk) => {
        appendToMessage(assistantMsgId, chunk, conversationId)
      })
      const thinkingBuffer = createStreamBuffer((chunk) => {
        appendToThinking(assistantMsgId, chunk, conversationId)
      })

      try {
        const { thinking } = await executeAgentStream(
          conversationId,
          trimmed,
          commandMode,
          (chunk, complete) => {
            if (complete) {
              thinkingBuffer.flushNow()
              setThinkingComplete(assistantMsgId, true, conversationId)
            } else {
              thinkingBuffer.append(chunk)
            }
          },
          (chunk) => {
            contentBuffer.append(chunk)
          },
          (content) => {
            contentBuffer.flushNow()
            thinkingBuffer.flushNow()
            updateMessage(assistantMsgId, { content }, conversationId)
          },
          controller.signal
        )
        contentBuffer.flushNow()
        thinkingBuffer.flushNow()
        if (thinking && thinking.length > 0) {
          updateMessage(assistantMsgId, { thinking, thinkingComplete: true }, conversationId)
        }
      } catch (err) {
        contentBuffer.flushNow()
        thinkingBuffer.flushNow()
        if (err instanceof Error && err.message === '已取消') {
          appendToMessage(assistantMsgId, '\n\n[已停止]', conversationId)
        } else {
          const errorMsg = `出错了: ${err instanceof Error ? err.message : String(err)}`
          appendToMessage(assistantMsgId, errorMsg, conversationId)
        }
      } finally {
        contentBuffer.flushNow()
        thinkingBuffer.flushNow()
        if (useChatStore.getState().abortController === controller) {
          setLoading(false)
          setAbortController(null)
        }
      }
    },
    [
      inputText,
      activeConversationId,
      commandMode,
      isLoading,
      addMessage,
      addStreamingMessage,
      appendToMessage,
      appendToThinking,
      setThinkingComplete,
      updateMessage,
      setInputText,
      setLoading,
      setAbortController,
      touchConversation
    ]
  )
}
