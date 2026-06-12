import { useRef, useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { Card } from '@/components/ui/card'
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
  const hasActiveThinking =
    Boolean(activeAssistantMessage?.thinking) && activeAssistantMessage?.thinkingComplete !== true
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

        {isLoading && !hasActiveThinking && (
          <div className="flex justify-start">
            <Card className="flex items-center gap-2 border-border/60 bg-card/55 px-3 py-2 text-xs text-muted-foreground shadow-none">
              <Loader2 size={13} className="animate-spin text-muted-foreground/70" />
              <span>正在思考</span>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageList
