import { VisualBlock } from '@/types'

const VISUAL_BLOCK_REGEX = /```visual:(\w+)\n([\s\S]*?)\n```/g
const VISUAL_FENCE_MARKER = '```visual:'

export type ParsedMessagePart =
  | { type: 'text'; content: string }
  | { type: 'visual'; block: VisualBlock }

interface VisualCandidate {
  start: number
  end: number
  block: VisualBlock
}

function getPendingVisualType(text: string): string | undefined {
  const lineStart = Math.max(text.lastIndexOf('\n'), -1) + 1
  const currentLine = text.slice(lineStart)

  if (
    currentLine.length > 0 &&
    currentLine.length < VISUAL_FENCE_MARKER.length &&
    VISUAL_FENCE_MARKER.startsWith(currentLine)
  ) {
    return 'visual'
  }

  const fenceStart = text.lastIndexOf(VISUAL_FENCE_MARKER)
  if (fenceStart !== -1) {
    const contentStart = text.indexOf('\n', fenceStart)
    const closeSearchStart = contentStart === -1 ? fenceStart + VISUAL_FENCE_MARKER.length : contentStart + 1
    const closingIdx = text.indexOf('\n```', closeSearchStart)

    if (closingIdx === -1) {
      const typeStart = fenceStart + VISUAL_FENCE_MARKER.length
      const typeEnd = text.slice(typeStart).search(/\W/)
      const type = text.slice(typeStart, typeEnd === -1 ? undefined : typeStart + typeEnd)
      return type || 'visual'
    }
  }

  const directMatch = /visual:(\w+)\s+\{/.exec(text)
  if (directMatch) {
    const jsonStart = directMatch.index + directMatch[0].length - 1
    let braceCount = 1
    let i = jsonStart + 1

    while (i < text.length && braceCount > 0) {
      if (text[i] === '{') braceCount++
      else if (text[i] === '}') braceCount--
      i++
    }

    if (braceCount > 0) return directMatch[1]
  }

  return undefined
}

function hidePendingVisualFencePrefix(text: string): string {
  const lineStart = Math.max(text.lastIndexOf('\n'), -1) + 1
  const currentLine = text.slice(lineStart)

  if (
    currentLine.length > 0 &&
    currentLine.length < VISUAL_FENCE_MARKER.length &&
    VISUAL_FENCE_MARKER.startsWith(currentLine)
  ) {
    return text.slice(0, lineStart)
  }

  return text
}

function hideIncompleteVisualFence(text: string): string {
  let searchStart = 0

  while (true) {
    const startIdx = text.indexOf(VISUAL_FENCE_MARKER, searchStart)
    if (startIdx === -1) return text

    const contentStart = text.indexOf('\n', startIdx)
    if (contentStart === -1) return text.slice(0, startIdx)

    const closingIdx = text.indexOf('\n```', contentStart + 1)
    if (closingIdx === -1) return text.slice(0, startIdx)

    searchStart = closingIdx + 4
  }
}

function hideIncompleteDirectVisual(text: string): string {
  const directRegex = /visual:\w+\s+\{/g
  let match

  while ((match = directRegex.exec(text)) !== null) {
    const jsonStart = match.index + match[0].length - 1
    let braceCount = 1
    let i = jsonStart + 1

    while (i < text.length && braceCount > 0) {
      if (text[i] === '{') braceCount++
      else if (text[i] === '}') braceCount--
      i++
    }

    if (braceCount > 0) {
      return text.slice(0, match.index)
    }
  }

  return text
}

function hideIncompleteVisualContent(text: string): string {
  return hideIncompleteDirectVisual(hideIncompleteVisualFence(hidePendingVisualFencePrefix(text)))
}

function cleanupText(text: string): string {
  return hideIncompleteVisualContent(text).replace(/\n{3,}/g, '\n\n').trim()
}

function overlaps(candidate: VisualCandidate, accepted: VisualCandidate[]): boolean {
  return accepted.some((item) => candidate.start < item.end && candidate.end > item.start)
}

function collectVisualCandidates(content: string): VisualCandidate[] {
  const candidates: VisualCandidate[] = []
  let match

  VISUAL_BLOCK_REGEX.lastIndex = 0
  while ((match = VISUAL_BLOCK_REGEX.exec(content)) !== null) {
    try {
      candidates.push({
        start: match.index,
        end: match.index + match[0].length,
        block: { type: match[1], data: JSON.parse(match[2]) }
      })
    } catch {
      // Invalid visual JSON is left as regular text.
    }
  }

  const jsonFenceRegex = /```json\n?([\s\S]*?)\n?```/g
  while ((match = jsonFenceRegex.exec(content)) !== null) {
    try {
      const data = JSON.parse(match[1].trim())
      if (data && data.city && data.temperature !== undefined) {
        candidates.push({
          start: match.index,
          end: match.index + match[0].length,
          block: { type: 'weather_card', data }
        })
      }
    } catch {
      // Non-visual JSON stays in the markdown response.
    }
  }

  const directRegex = /visual:(\w+)\s+\{/g
  while ((match = directRegex.exec(content)) !== null) {
    const type = match[1]
    const jsonStart = match.index + match[0].length - 1
    let braceCount = 1
    let i = jsonStart + 1

    while (i < content.length && braceCount > 0) {
      if (content[i] === '{') braceCount++
      else if (content[i] === '}') braceCount--
      i++
    }

    if (braceCount !== 0) continue

    try {
      candidates.push({
        start: match.index,
        end: i,
        block: { type, data: JSON.parse(content.slice(jsonStart, i)) }
      })
    } catch {
      if (type === 'weather_card') {
        candidates.push({
          start: match.index,
          end: i,
          block: {
            type: 'weather_card',
            data: { city: '数据解析中', condition: '未知', temperature: 0, forecast: [] }
          }
        })
      }
    }
  }

  const accepted: VisualCandidate[] = []
  for (const candidate of candidates.sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (!overlaps(candidate, accepted)) {
      accepted.push(candidate)
    }
  }

  return accepted
}

export function parseMessage(content: string): {
  text: string
  visuals: VisualBlock[]
  parts: ParsedMessagePart[]
  pendingVisualType?: string
} {
  const candidates = collectVisualCandidates(content)
  const parts: ParsedMessagePart[] = []
  const visuals: VisualBlock[] = candidates.map((candidate) => candidate.block)
  let cursor = 0

  for (const candidate of candidates) {
    const textPart = cleanupText(content.slice(cursor, candidate.start))
    if (textPart) {
      parts.push({ type: 'text', content: textPart })
    }
    parts.push({ type: 'visual', block: candidate.block })
    cursor = candidate.end
  }

  const pendingVisualType = getPendingVisualType(content)
  const trailingText = cleanupText(content.slice(cursor))
  if (trailingText) {
    parts.push({ type: 'text', content: trailingText })
  }

  const text = cleanupText(
    parts
      .filter((part): part is Extract<ParsedMessagePart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.content)
      .join('\n\n')
  )

  return { text, visuals, parts, pendingVisualType }
}
