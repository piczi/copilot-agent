import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useChatStore } from '@/store/chatStore'
import ConversationItem from './ConversationItem'
import { fadeScale, quickFade } from '@/lib/motion'

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
    <motion.div layout className="scrollbar-auto-hide h-full space-y-0.5 overflow-y-auto px-2 py-2">
      <AnimatePresence initial={false}>
        {sorted.length === 0 && (
        <motion.div
          key="empty-conversations"
          variants={fadeScale}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={quickFade}
          className="px-2 py-4 text-left"
        >
          <p className="text-xs text-muted-foreground">暂无聊天记录</p>
        </motion.div>
        )}
        {sorted.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            isActive={conv.id === activeConversationId}
            onClick={() => { void setActiveConversation(conv.id) }}
            onDelete={() => { void deleteConversation(conv.id) }}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  )
}

export default ConversationList
