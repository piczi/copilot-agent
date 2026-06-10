import { useMemo } from 'react'
import { useChatStore } from '@/store/chatStore'
import ConversationItem from './ConversationItem'

const ConversationList: React.FC = () => {
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)

  const sorted = useMemo(
    () =>
      [...conversations].sort(
        (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id)
      ),
    [conversations]
  )

  return (
    <div className="h-full space-y-0.5 overflow-y-auto px-2 py-2">
      {sorted.length === 0 && (
        <div className="px-2 py-4 text-left">
          <p className="text-xs text-muted-foreground">暂无聊天记录</p>
        </div>
      )}
      {sorted.map((conv) => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          isActive={conv.id === activeConversationId}
          onClick={() => setActiveConversation(conv.id)}
          onDelete={() => deleteConversation(conv.id)}
        />
      ))}
    </div>
  )
}

export default ConversationList
