import { useRef, useEffect, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import MessageItem from './MessageItem'

const MessageList: React.FC = () => {
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const messages = useMemo(() => {
    const conv = conversations.find((c) => c.id === activeConversationId)
    return conv?.messages || []
  }, [conversations, activeConversationId])
  const isLoading = useChatStore((s) => s.isLoading)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (messages.length === 0) {
    return <div className="flex-1" />
  }

  return (
    <div className="relative flex-1 space-y-5 overflow-y-auto px-5 py-6">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}

      {isLoading && (
        <div className="flex animate-fade-up justify-start">
          <div className="flex items-center gap-3 px-1 py-2 text-sm text-muted-foreground">
            <div className="agent-loading-orb" aria-hidden="true">
              <Sparkles size={15} className="relative z-10 text-primary" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">正在思考</span>
              <span className="agent-loading-dot" />
              <span className="agent-loading-dot [animation-delay:160ms]" />
              <span className="agent-loading-dot [animation-delay:320ms]" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

export default MessageList
