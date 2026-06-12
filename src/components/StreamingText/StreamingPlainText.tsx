import React, { useEffect, useRef } from 'react'
import MarkdownContent from '@/components/MarkdownContent'
import StreamChunkSpan from '@/components/StreamingText/StreamChunkSpan'
import { useStreamChunks } from '@/hooks/useStreamChunks'

interface StreamingPlainTextProps {
  content: string
  streaming?: boolean
  resetKey?: string
  className?: string
}

const StreamingPlainText: React.FC<StreamingPlainTextProps> = ({
  content,
  streaming = false,
  resetKey,
  className = ''
}) => {
  const wasStreamingRef = useRef(streaming)

  useEffect(() => {
    if (streaming) wasStreamingRef.current = true
  }, [streaming])

  useEffect(() => {
    wasStreamingRef.current = false
  }, [resetKey])

  const trackChunks = streaming || wasStreamingRef.current
  const { chunks, animatingChunks, commitChunk } = useStreamChunks(content, {
    resetKey,
    enabled: trackChunks
  })

  const useFinalMarkdown = !trackChunks || (!streaming && animatingChunks.length === 0)

  if (useFinalMarkdown) {
    if (!content) return null
    return (
      <MarkdownContent
        content={content}
        className={`streaming-plain-text ${className}`.trim()}
      />
    )
  }

  return (
    <div className={`streaming-plain-text min-w-0 ${className}`.trim()}>
      {chunks.map((chunk) => (
        <StreamChunkSpan
          key={chunk.id}
          chunkId={chunk.id}
          text={chunk.text}
          onCommit={commitChunk}
        />
      ))}
    </div>
  )
}

export default StreamingPlainText
