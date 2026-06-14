import { useRef, useEffect, useMemo } from 'react'
import { useChatStore } from '@/store/chatStore'
import { chatContentClass } from '@/lib/layout'
import MessageItem from './MessageItem'

const MessageList: React.FC = () => {
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const messages = useMemo(() => {
    const conv = conversations.find((c) => c.id === activeConversationId)
    return conv?.messages || []
  }, [conversations, activeConversationId])
  const activeAssistantMessage = messages.findLast((msg) => msg.role === 'assistant')
  const hasAssistantResponseSignal =
    Boolean(activeAssistantMessage?.thinking) || Boolean(activeAssistantMessage?.content.trim())
  const isLoading = useChatStore((s) => s.isLoading)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isLoading, activeConversationId])

  if (messages.length === 0) {
    return <div className="flex-1" />
  }

  return (
    <div ref={listRef} className="relative flex-1 overflow-y-auto px-5 py-6">
      <div className={`${chatContentClass} space-y-5`}>
        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isStreaming={isLoading && msg.id === activeAssistantMessage?.id}
          />
        ))}

        {isLoading && !hasAssistantResponseSignal && (
          <p className="px-1 text-xs text-muted-foreground/50">正在思考...</p>
        )}
      </div>
    </div>
  )
}

export default MessageList
