import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { Conversation } from '@/types'
import { cn } from '@/lib/utils'
import { quickFade, softSpring } from '@/lib/motion'

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onClick: () => void
  onDelete: () => void
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  onClick,
  onDelete
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.98 }}
      transition={softSpring}
      onClick={onClick}
      className={cn(
        'group relative flex h-8 cursor-pointer items-center rounded-sm px-2.5 text-sm transition-[background-color,color] duration-150 ease-out',
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/55 hover:text-foreground'
      )}
    >
      {isActive && (
        <motion.span
          layoutId="active-conversation-indicator"
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-sm bg-foreground/40"
          transition={softSpring}
        />
      )}
      <p className="min-w-0 flex-1 truncate pr-2 font-normal">{conversation.title}</p>
      <motion.button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        transition={quickFade}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-150 ease-out hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="删除"
        aria-label="删除会话"
      >
        <X size={14} />
      </motion.button>
    </motion.div>
  )
}

export default ConversationItem
