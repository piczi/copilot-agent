import { AnimatePresence, motion } from 'motion/react'
import ConversationList from './ConversationList'
import { cn } from '@/lib/utils'
import { softSpring } from '@/lib/motion'

interface SidebarProps {
  collapsed: boolean
}

const Sidebar = ({ collapsed }: SidebarProps) => {
  return (
    <motion.aside
      layout
      animate={{ width: collapsed ? 0 : 240 }}
      transition={softSpring}
      className={cn(
        'hidden h-full shrink-0 overflow-hidden flex-col border-r border-border bg-background md:flex',
        collapsed && 'border-r-0'
      )}
    >
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="sidebar-content"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={softSpring}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <ConversationList />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

export default Sidebar
