import React from 'react'
import { Message } from '@/types'
import { parseMessage } from '@/utils/parseMessage'
import VisualRenderer from '@/components/Visuals/VisualRenderer'
import VisualSkeleton from '@/components/Visuals/VisualSkeleton'
import MarkdownContent from '@/components/MarkdownContent'
import ThinkingPanel from '@/components/ThinkingPanel'

interface MessageItemProps {
  message: Message
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-tr-md border border-border bg-secondary px-4 py-3 text-secondary-foreground shadow-sm">
          <MarkdownContent content={message.content} />
        </div>
      </div>
    )
  }

  const { text, visuals, pendingVisualType } = parseMessage(message.content)
  // 如果 content 中包含 <thinking> 标签（模型通过 content 输出而非 reasoning_content），
  // 从 text 中移除它，避免重复显示
  const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/)
  const cleanText = thinkingMatch ? text.replace(thinkingMatch[0], '').trim() : text
  const hasThinking = message.thinking !== undefined && message.thinking.length > 0

  return (
    <div className="flex animate-fade-up justify-start">
      <div className="min-w-0 max-w-[82%] space-y-3">
        {hasThinking && (
          <ThinkingPanel
            thinking={message.thinking || ''}
            complete={message.thinkingComplete || false}
          />
        )}
        {cleanText && (
          <div className="px-1 py-1">
            <MarkdownContent content={cleanText} />
          </div>
        )}
        {visuals && visuals.length > 0 && <VisualRenderer blocks={visuals} />}
        {pendingVisualType && <VisualSkeleton type={pendingVisualType} />}
      </div>
    </div>
  )
}

export default MessageItem
