import React, { useEffect, useMemo, useRef } from 'react'
import MarkdownContent from '@/components/MarkdownContent'
import { useStreamChunks } from '@/hooks/useStreamChunks'

interface StreamingMarkdownProps {
  content: string
  streaming?: boolean
  resetKey?: string
  className?: string
}

type VisibleRange = {
  id: string
  start: number
  end: number
  createdAt: number
}

type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
  }
}

const STREAM_CHUNK_FADE_MS = 500
const NEW_CHUNK_ZERO_FRAME_MS = 32

function getChunkOpacity(createdAt: number, now: number) {
  const elapsed = Math.max(0, now - createdAt)

  if (elapsed <= NEW_CHUNK_ZERO_FRAME_MS) {
    return 0
  }

  const progress = Math.min(1, elapsed / STREAM_CHUNK_FADE_MS)
  return 1 - Math.pow(1 - progress, 3)
}

type StreamFadeSpanProps = React.ComponentPropsWithoutRef<'span'> & {
  'data-stream-created-at'?: string
  streamNow: number
}

const StreamFadeSpan: React.FC<StreamFadeSpanProps> = ({
  children,
  className = '',
  style,
  streamNow,
  'data-stream-created-at': createdAtValue,
  ...props
}) => {
  const createdAt = Number(createdAtValue)
  const opacity = Number.isFinite(createdAt) ? getChunkOpacity(createdAt, streamNow) : 1

  return (
    <span
      {...props}
      className={`stream-chunk ${className}`.trim()}
      style={{ ...style, opacity: Number.isFinite(opacity) ? opacity : 1 }}
    >
      {children}
    </span>
  )
}

function createFadeNode(value: string, range: VisibleRange): MarkdownNode {
  return {
    type: 'emphasis',
    data: {
      hName: 'span',
      hProperties: {
        className: 'stream-chunk',
        'data-stream-chunk-id': range.id,
        'data-stream-created-at': String(range.createdAt)
      }
    },
    children: [{ type: 'text', value }]
  }
}

function createStreamingFadePlugin(ranges: VisibleRange[]) {
  return () => (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return

      const nextChildren: MarkdownNode[] = []

      for (const child of node.children) {
        if (child.type === 'text' && typeof child.value === 'string') {
          const nodeStart = child.position?.start?.offset
          const nodeEnd = child.position?.end?.offset

          if (typeof nodeStart !== 'number' || typeof nodeEnd !== 'number') {
            nextChildren.push(child)
            continue
          }

          let cursor = nodeStart
          const overlappingRanges = ranges.filter((range) => range.end > nodeStart && range.start < nodeEnd)

          if (overlappingRanges.length === 0) {
            nextChildren.push(child)
            continue
          }

          for (const range of overlappingRanges) {
            const overlapStart = Math.max(cursor, range.start)
            const overlapEnd = Math.min(nodeEnd, range.end)

            if (overlapStart > cursor) {
              nextChildren.push({
                type: 'text',
                value: child.value.slice(cursor - nodeStart, overlapStart - nodeStart)
              })
            }

            if (overlapEnd > overlapStart) {
              nextChildren.push(
                createFadeNode(child.value.slice(overlapStart - nodeStart, overlapEnd - nodeStart), range)
              )
            }

            cursor = Math.max(cursor, overlapEnd)
          }

          if (cursor < nodeEnd) {
            nextChildren.push({
              type: 'text',
              value: child.value.slice(cursor - nodeStart)
            })
          }

          continue
        }

        visit(child)
        nextChildren.push(child)
      }

      node.children = nextChildren
    }

    visit(tree)
  }
}

const StreamingMarkdown: React.FC<StreamingMarkdownProps> = ({
  content,
  streaming = false,
  resetKey,
  className = ''
}) => {
  const wasStreamingRef = useRef(streaming)
  const [streamNow, setStreamNow] = React.useState(() => Date.now())

  useEffect(() => {
    if (streaming) wasStreamingRef.current = true
  }, [streaming])

  useEffect(() => {
    wasStreamingRef.current = false
  }, [resetKey])

  const trackChunks = streaming || wasStreamingRef.current
  const { animatingChunks, allCommitted } = useStreamChunks(content, {
    resetKey,
    enabled: trackChunks,
    autoCommitMs: STREAM_CHUNK_FADE_MS
  })

  useEffect(() => {
    if (animatingChunks.length === 0) return

    let frame = 0

    const tick = () => {
      setStreamNow(Date.now())
      frame = window.requestAnimationFrame(tick)
    }

    tick()

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [animatingChunks.length])

  const useFinalMarkdown = !trackChunks || (!streaming && (allCommitted || content.length === 0))

  const animatedRanges = useMemo<VisibleRange[]>(
    () =>
      animatingChunks
        .map((chunk) => ({
          id: chunk.id,
          start: chunk.start,
          end: chunk.end,
          createdAt: chunk.createdAt
        }))
        .filter((range) => range.end > range.start),
    [animatingChunks]
  )

  const fadePlugin = useMemo(() => createStreamingFadePlugin(animatedRanges), [animatedRanges])

  if (useFinalMarkdown) {
    return <MarkdownContent content={content} className={className} />
  }

  return (
    <MarkdownContent
      content={content}
      className={className}
      remarkPlugins={[fadePlugin]}
      components={{ span: (props) => <StreamFadeSpan {...props} streamNow={streamNow} /> }}
    />
  )
}

export default StreamingMarkdown
