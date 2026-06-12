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

function getCodeFadeRanges(value: string, nodeStart: number, source: string, ranges: VisibleRange[]) {
  const valueStart = source.indexOf(value, nodeStart)

  if (valueStart === -1) return []

  const valueEnd = valueStart + value.length

  return ranges
    .filter((range) => range.end > valueStart && range.start < valueEnd)
    .map((range) => ({
      id: range.id,
      start: Math.max(0, range.start - valueStart),
      end: Math.min(value.length, range.end - valueStart),
      createdAt: range.createdAt
    }))
    .filter((range) => range.end > range.start)
}

function createFadeNode(value: string, range: VisibleRange): MarkdownNode {
  const elapsed = Math.min(STREAM_CHUNK_FADE_MS, Math.max(0, Date.now() - range.createdAt))

  return {
    type: 'emphasis',
    data: {
      hName: 'span',
      hProperties: {
        className: 'stream-chunk stream-chunk-fade',
        'data-stream-chunk-id': range.id,
        'data-stream-created-at': String(range.createdAt),
        style: { animationDelay: `-${elapsed}ms` }
      }
    },
    children: [{ type: 'text', value }]
  }
}

function createStreamingFadePlugin(content: string, ranges: VisibleRange[]) {
  return () => (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return

      const nextChildren: MarkdownNode[] = []

      for (const child of node.children) {
        if ((child.type === 'code' || child.type === 'inlineCode') && typeof child.value === 'string') {
          const nodeStart = child.position?.start?.offset
          const codeRanges = typeof nodeStart === 'number'
            ? getCodeFadeRanges(child.value, nodeStart, content, ranges)
            : []

          if (codeRanges.length > 0) {
            child.data = {
              ...child.data,
              hProperties: {
                ...child.data?.hProperties,
                'data-stream-code-ranges': JSON.stringify(codeRanges)
              }
            }
          }

          nextChildren.push(child)
          continue
        }

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

  const fadePlugin = useMemo(() => createStreamingFadePlugin(content, animatedRanges), [content, animatedRanges])

  if (useFinalMarkdown) {
    return <MarkdownContent content={content} className={className} />
  }

  return (
    <MarkdownContent
      content={content}
      className={className}
      remarkPlugins={[fadePlugin]}
    />
  )
}

export default StreamingMarkdown
