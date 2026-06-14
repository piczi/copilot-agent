import type { ChatStreamPayload } from '@/shared/ipc'

export function createVisualBlock(type: string, data: Record<string, unknown>): string {
  return `\`\`\`visual:${type}\n${JSON.stringify(data, null, 2)}\n\`\`\``
}

export function createTerminalBlock(command: string, platform: string, output: string, exitCode: number | null): string {
  return createVisualBlock('terminal', { command, platform, output, exitCode })
}

export function createContentRouter(emit: (payload: ChatStreamPayload) => void): {
  push: (chunk: string) => void
  flush: () => void
} {
  const thinkingStart = '<thinking>'
  const thinkingEnd = '</thinking>'
  let mode: 'unknown' | 'thinking' | 'text' = 'unknown'
  let buffer = ''
  let thinkingOpen = false

  const finishThinking = () => {
    if (thinkingOpen) {
      thinkingOpen = false
      emit({ type: 'thinking_done' })
    }
  }

  const route = () => {
    while (buffer) {
      if (mode === 'unknown') {
        if (buffer.startsWith(thinkingStart)) {
          buffer = buffer.slice(thinkingStart.length)
          mode = 'thinking'
          thinkingOpen = true
          continue
        }
        if (thinkingStart.startsWith(buffer)) return
        mode = 'text'
        continue
      }

      if (mode === 'thinking') {
        const endIdx = buffer.indexOf(thinkingEnd)
        if (endIdx !== -1) {
          const thinkingChunk = buffer.slice(0, endIdx)
          if (thinkingChunk) emit({ type: 'thinking', chunk: thinkingChunk })
          buffer = buffer.slice(endIdx + thinkingEnd.length).replace(/^\s+/, '')
          mode = 'text'
          finishThinking()
          continue
        }

        const safeLength = Math.max(0, buffer.length - thinkingEnd.length)
        if (safeLength > 0) {
          emit({ type: 'thinking', chunk: buffer.slice(0, safeLength) })
          buffer = buffer.slice(safeLength)
        }
        return
      }

      emit({ type: 'text', chunk: buffer })
      buffer = ''
    }
  }

  return {
    push: (chunk) => {
      buffer += chunk
      route()
    },
    flush: () => {
      if (mode === 'thinking' && buffer) {
        emit({ type: 'thinking', chunk: buffer })
        buffer = ''
        finishThinking()
        return
      }
      if (buffer) {
        emit({ type: 'text', chunk: buffer })
        buffer = ''
      }
    }
  }
}
