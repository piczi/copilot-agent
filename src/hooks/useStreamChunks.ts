import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type StreamChunk = {
  id: string
  text: string
  start: number
  end: number
  createdAt: number
  status: 'animating' | 'committed'
}

interface UseStreamChunksOptions {
  resetKey?: string
  enabled?: boolean
  autoCommitMs?: number
}

export function useStreamChunks(content: string, options?: UseStreamChunksOptions) {
  const enabled = options?.enabled ?? true
  const [chunks, setChunks] = useState<StreamChunk[]>([])
  const lastContentRef = useRef('')
  const chunkIndexRef = useRef(0)
  const resetKeyRef = useRef(options?.resetKey)
  const timersRef = useRef<Map<string, number>>(new Map())

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const commitChunk = useCallback(
    (id: string) => {
      clearTimer(id)
      setChunks((current) =>
        current.map((chunk) => (chunk.id === id ? { ...chunk, status: 'committed' as const } : chunk))
      )
    },
    [clearTimer]
  )

  const scheduleCommit = useCallback(
    (id: string) => {
      if (!options?.autoCommitMs) return
      clearTimer(id)
      const timer = window.setTimeout(() => commitChunk(id), options.autoCommitMs)
      timersRef.current.set(id, timer)
    },
    [clearTimer, commitChunk, options?.autoCommitMs]
  )

  const resetChunks = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current.clear()
    lastContentRef.current = ''
    chunkIndexRef.current = 0
    setChunks([])
  }, [])

  const replaceWithChunk = useCallback(
    (text: string, resetKey?: string) => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current.clear()
      lastContentRef.current = text
      chunkIndexRef.current = 1
      const id = resetKey ? `${resetKey}-0` : 'chunk-0'
      setChunks(
        text
          ? [{ id, text, start: 0, end: text.length, createdAt: Date.now(), status: 'animating' }]
          : []
      )
      if (text) scheduleCommit(id)
    },
    [scheduleCommit]
  )

  useLayoutEffect(() => {
    if (options?.resetKey !== resetKeyRef.current) {
      resetKeyRef.current = options?.resetKey
      resetChunks()
    }
  }, [options?.resetKey, resetChunks])

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [])

  useLayoutEffect(() => {
    if (!enabled) return

    const prev = lastContentRef.current

    if (content === prev) return

    if (prev && !content.startsWith(prev)) {
      replaceWithChunk(content, options?.resetKey)
      return
    }

    if (content.length < prev.length) {
      replaceWithChunk(content, options?.resetKey)
      return
    }

    if (content.length > prev.length) {
      const newText = content.slice(prev.length)
      lastContentRef.current = content
      const idx = chunkIndexRef.current++
      const id = options?.resetKey ? `${options.resetKey}-${idx}` : `chunk-${idx}`
      const nextChunk: StreamChunk = {
        id,
        text: newText,
        start: prev.length,
        end: content.length,
        createdAt: Date.now(),
        status: 'animating'
      }

      setChunks((current) => [
        ...current,
        nextChunk
      ])
      scheduleCommit(id)
    }
  }, [
    content,
    enabled,
    options?.resetKey,
    replaceWithChunk,
    resetChunks,
    scheduleCommit
  ])

  const animatingChunks = chunks.filter((chunk) => chunk.status === 'animating')
  const allCommitted = chunks.length > 0 && animatingChunks.length === 0

  return { chunks, animatingChunks, commitChunk, allCommitted }
}
