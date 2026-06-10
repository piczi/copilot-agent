import { VisualBlock } from '@/types'

const VISUAL_BLOCK_REGEX = /```visual:(\w+)\n([\s\S]*?)\n```/g
const VISUAL_FENCE_MARKER = '```visual:'

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

export function parseMessage(content: string): {
  text: string
  visuals: VisualBlock[]
  pendingVisualType?: string
} {
  const visuals: VisualBlock[] = []
  let text = content

  // 1. 匹配代码块格式 ```visual:xxx
  let match
  while ((match = VISUAL_BLOCK_REGEX.exec(text)) !== null) {
    const type = match[1]
    const jsonStr = match[2]
    try {
      const data = JSON.parse(jsonStr)
      visuals.push({ type, data })
      text = text.replace(match[0], '')
      VISUAL_BLOCK_REGEX.lastIndex = 0
    } catch {
      // skip invalid JSON
    }
  }

  // 2. 匹配 ```json 代码块中包含天气数据的，自动解析为 weather_card
  let searchStart = 0
  while (true) {
    const startIdx = text.indexOf('```json', searchStart)
    if (startIdx === -1) break

    const afterMarker = startIdx + 6
    // 找到代码块结束位置
    const endIdx = text.indexOf('```', afterMarker)
    if (endIdx === -1) break

    const jsonStr = text.slice(afterMarker, endIdx).trim()
    try {
      const data = JSON.parse(jsonStr)
      // 判断是否为天气数据（包含 city 和 temperature 字段）
      if (data && data.city && data.temperature !== undefined) {
        visuals.push({ type: 'weather_card', data })
        text = text.slice(0, startIdx) + text.slice(endIdx + 3)
        searchStart = startIdx
        continue
      }
    } catch {
      // skip invalid JSON
    }

    searchStart = afterMarker
  }

  // 3. 匹配直接格式 visual:xxx {json}
  const directRegex = /visual:(\w+)\s+\{/g
  while ((match = directRegex.exec(text)) !== null) {
    const type = match[1]
    const jsonStart = match.index + match[0].length - 1 // 指向 '{'

    // 找到匹配的闭合 '}'
    let braceCount = 1
    let i = jsonStart + 1
    while (i < text.length && braceCount > 0) {
      if (text[i] === '{') braceCount++
      else if (text[i] === '}') braceCount--
      i++
    }

    if (braceCount === 0) {
      const jsonStr = text.slice(jsonStart, i)
      const fullMatch = text.slice(match.index, i)
      text = text.replace(fullMatch, '')
      directRegex.lastIndex = 0

      try {
        const data = JSON.parse(jsonStr)
        visuals.push({ type, data })
      } catch {
        // JSON 解析失败，文本已移除，不显示原始数据给用户
        // 为 weather_card 类型添加占位卡片
        if (type === 'weather_card') {
          visuals.push({
            type: 'weather_card',
            data: { city: '数据解析中', condition: '未知', temperature: 0, forecast: [] }
          })
        }
      }
    }
  }

  const pendingVisualType = getPendingVisualType(text)
  text = hideIncompleteVisualContent(text)

  // Clean up extra newlines left from removing blocks
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return { text, visuals, pendingVisualType }
}
