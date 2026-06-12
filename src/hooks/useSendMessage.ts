import { useCallback } from 'react'
import { executeAgentStream } from '@/agent'
import { useChatStore } from '@/store/chatStore'
import { ChatHistoryMessage, Message } from '@/types'

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
  const persistConversations = useChatStore((s) => s.persistConversations)

  return useCallback(
    async (messageText?: string) => {
      const trimmed = (messageText ?? inputText).trim()
      if (!trimmed || isLoading) return
      const conversationId = activeConversationId
      const conversation = useChatStore
        .getState()
        .conversations
        .find((item) => item.id === conversationId)
      const history: ChatHistoryMessage[] = (conversation?.messages || [])
        .filter((message): message is Message & ChatHistoryMessage =>
          (message.role === 'user' || message.role === 'assistant') &&
          message.content.trim().length > 0
        )
        .map((message) => ({
          role: message.role,
          content: message.content
        }))

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now()
      }
      addMessage(userMsg)
      setInputText('')

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

      try {
        const { thinking } = await executeAgentStream(
          trimmed,
          commandMode,
          history,
          (chunk, complete) => {
            if (complete) {
              setThinkingComplete(assistantMsgId, true, conversationId)
            } else {
              appendToThinking(assistantMsgId, chunk, conversationId)
            }
          },
          (chunk) => {
            appendToMessage(assistantMsgId, chunk, conversationId)
          },
          (content) => {
            updateMessage(assistantMsgId, { content }, conversationId)
          },
          controller.signal
        )
        // Some providers return thinking inside content instead of reasoning chunks.
        if (thinking && thinking.length > 0) {
          updateMessage(assistantMsgId, { thinking, thinkingComplete: true }, conversationId)
        }
      } catch (err) {
        if (err instanceof Error && err.message === '已取消') {
          appendToMessage(assistantMsgId, '\n\n[已停止]', conversationId)
        } else {
          const errorMsg = `出错了: ${err instanceof Error ? err.message : String(err)}`
          appendToMessage(assistantMsgId, errorMsg, conversationId)
        }
      } finally {
        if (useChatStore.getState().abortController === controller) {
          setLoading(false)
          setAbortController(null)
        }
        persistConversations()
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
      persistConversations
    ]
  )
}
