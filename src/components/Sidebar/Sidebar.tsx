import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import ConversationList from './ConversationList'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const createConversation = useChatStore((s) => s.createConversation)
  const persistConversations = useChatStore((s) => s.persistConversations)

  const handleNewChat = () => {
    const activeId = useChatStore.getState().activeConversationId
    const conversations = useChatStore.getState().conversations
    const activeConv = conversations.find((c) => c.id === activeId)
    // 如果当前对话已经是空的，不再创建新对话
    if (activeConv && activeConv.messages.length === 0) {
      return
    }
    createConversation()
    persistConversations()
  }

  return (
    <aside
      className={cn(
        'hidden h-full shrink-0 flex-col border-r border-border bg-background transition-[width] duration-300 ease-out md:flex',
        collapsed ? 'w-12' : 'w-64'
      )}
    >
      <div className={cn('border-b border-border transition-all duration-300 ease-out', collapsed ? 'p-2' : 'px-3 py-2.5')}>
        <div className={cn('mb-2 flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && <p className="text-xs font-medium text-muted-foreground">聊天历史</p>}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? '展开聊天历史' : '收起聊天历史'}
            title={collapsed ? '展开聊天历史' : '收起聊天历史'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </Button>
        </div>
        <Button
          onClick={handleNewChat}
          variant={collapsed ? 'ghost' : 'outline'}
          size={collapsed ? 'icon-sm' : 'sm'}
          className={cn('rounded-lg transition-all duration-300 ease-out', collapsed ? 'mx-auto flex' : 'h-8 w-full justify-start')}
          aria-label="新对话"
          title="新对话"
        >
          <Plus size={16} />
          {!collapsed && <span>新对话</span>}
        </Button>
      </div>
      <div className={cn('min-h-0 flex-1 overflow-hidden transition-opacity duration-200 ease-out', collapsed && 'pointer-events-none opacity-0')}>
        {!collapsed && <ConversationList />}
      </div>
    </aside>
  )
}

export default Sidebar
