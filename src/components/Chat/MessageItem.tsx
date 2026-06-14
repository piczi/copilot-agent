import React from 'react'
import { Message } from '@/types'
import { parseMessage } from '@/utils/parseMessage'
import VisualRenderer from '@/components/Visuals/VisualRenderer'
import MarkdownContent from '@/components/MarkdownContent'
import StreamingMarkdown from '@/components/StreamingText/StreamingMarkdown'
import ThinkingPanel from '@/components/ThinkingPanel'

interface MessageItemProps {
  message: Message
  isStreaming?: boolean
}

const MessageItem: React.FC<MessageItemProps> = ({ message, isStreaming = false }) => {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-md rounded-tr-sm border border-border bg-secondary px-4 py-3 text-secondary-foreground shadow-sm">
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
    <div className="flex justify-start">
      <div className="min-w-0 w-full space-y-3">
        {hasThinking && (
          <ThinkingPanel
            thinking={message.thinking || ''}
            complete={message.thinkingComplete || false}
            streaming={!message.thinkingComplete}
            messageId={message.id}
          />
        )}
        {parts.map((part) =>
          part.type === 'text' ? (
            <div key={part.id} className="px-1 py-1">
              <StreamingMarkdown
                content={part.content}
                streaming={isStreaming}
                resetKey={`${message.id}-${part.id}`}
              />
            </div>
          ) : (
            <VisualRenderer key={part.id} blocks={[part.block]} />
          )
        )}
        {isStreaming && pendingVisualType && (
          <p className="px-1 text-xs text-muted-foreground/50">正在生成...</p>
        )}
      </div>
    </div>
  )
}

export default React.memo(MessageItem)
