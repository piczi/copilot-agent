import ConversationList from './ConversationList'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
}

const Sidebar = ({ collapsed }: SidebarProps) => {
  return (
    <aside
      className={cn(
        'hidden h-full shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-out md:flex',
        collapsed ? 'w-0 border-r-0' : 'w-60'
      )}
    >
      <div className={cn('min-h-0 flex-1 overflow-hidden transition-opacity duration-150 ease-out', collapsed && 'pointer-events-none opacity-0')}>
        {!collapsed && <ConversationList />}
      </div>
    </aside>
  )
}

export default Sidebar
