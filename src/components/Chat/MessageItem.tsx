import React from 'react'
import { Message } from '@/types'
import { parseMessage } from '@/utils/parseMessage'
import VisualRenderer from '@/components/Visuals/VisualRenderer'
import VisualSkeleton from '@/components/Visuals/VisualSkeleton'
import MarkdownContent from '@/components/MarkdownContent'
import ThinkingPanel from '@/components/ThinkingPanel'

interface MessageItemProps {
  message: Message
  isStreaming?: boolean
}

const MessageItem: React.FC<MessageItemProps> = ({ message, isStreaming = false }) => {
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

  // 如果 content 中包含 <thinking> 标签（模型通过 content 输出而非 reasoning_content），
  // 从 text 中移除它，避免重复显示
  const thinkingMatch = message.content.match(/<thinking>([\s\S]*?)<\/thinking>/)
  const displayContent = thinkingMatch ? message.content.replace(thinkingMatch[0], '').trim() : message.content
  const { parts, pendingVisualType } = parseMessage(displayContent)
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
        {parts.map((part, index) =>
          part.type === 'text' ? (
            <div key={`text-${index}`} className="px-1 py-1">
              <MarkdownContent content={part.content} />
            </div>
          ) : (
            <VisualRenderer key={`visual-${index}`} blocks={[part.block]} />
          )
        )}
        {isStreaming && pendingVisualType && <VisualSkeleton type={pendingVisualType} />}
      </div>
    </div>
  )
}

export default MessageItem
