import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import ConversationList from './ConversationList'
import { cn } from '@/lib/utils'
import { softSpring } from '@/lib/motion'

interface SidebarProps {
  collapsed: boolean
  width: number
  onWidthChange: (width: number) => void
}

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 420

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

const Sidebar = ({ collapsed, width, onWidthChange }: SidebarProps) => {
  const [resizing, setResizing] = useState(false)
  const dragStartRef = useRef({ x: 0, width })

  useEffect(() => {
    if (!resizing) return

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - dragStartRef.current.x
      onWidthChange(clampSidebarWidth(dragStartRef.current.width + delta))
    }

    const stopResizing = () => {
      setResizing(false)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }
  }, [onWidthChange, resizing])

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return

    event.preventDefault()
    dragStartRef.current = { x: event.clientX, width }
    setResizing(true)
  }, [collapsed, width])

  return (
    <motion.aside
      layout
      animate={{ width: collapsed ? 0 : width }}
      transition={resizing ? { duration: 0 } : softSpring}
      className={cn(
        'relative hidden h-full shrink-0 overflow-hidden flex-col border-r border-border bg-background md:flex',
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
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          onPointerDown={handleResizeStart}
          className={cn(
            'window-no-drag absolute right-0 top-0 z-10 h-full w-2 translate-x-1 cursor-col-resize touch-none',
            'after:absolute after:right-1 after:top-0 after:h-full after:w-px after:bg-transparent after:transition-colors hover:after:bg-primary/35',
            resizing && 'after:bg-primary/50'
          )}
        />
      )}
    </motion.aside>
  )
}

export default Sidebar
