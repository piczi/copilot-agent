import { SystemMessage, type BaseMessage } from '@langchain/core/messages'

export const INTERNAL_MESSAGE_KEY = 'internal'

const INTERNAL_LEAK_MARKERS = [
  '不要把原始错误直接展示给用户',
  '错误摘要：',
  'insufficient tool messages following tool_calls',
  'INVALID_TOOL_RESULTS',
  'docs.langchain.com/oss/javascript/langchain/errors'
]

const INTERNAL_USER_TEXT_PREFIXES = [
  '上一轮模型或工具调用失败',
  '你刚才在未尝试任何获取方式的情况下直接回复了'
]

export function createInternalSystemMessage(content: string): SystemMessage {
  return new SystemMessage({
    content,
    additional_kwargs: { [INTERNAL_MESSAGE_KEY]: true }
  })
}

export function isInternalMessage(message: BaseMessage): boolean {
  if (message.additional_kwargs?.[INTERNAL_MESSAGE_KEY] === true) {
    return true
  }

  const content = typeof message.content === 'string' ? message.content.trim() : ''
  if (!content) return false
  return INTERNAL_USER_TEXT_PREFIXES.some((prefix) => content.startsWith(prefix))
}

export function buildErrorRecoveryPrompt(error: unknown): string {
  const summary = error instanceof Error ? error.message : String(error)
  return [
    '上一轮模型或工具调用失败。不要把原始错误直接展示给用户。',
    `错误摘要：${summary}`,
    '请基于已有上下文继续给出有帮助的回答；请尝试其他可用方式获取数据后再回答；仅在合理途径都失败后才说明暂时无法完成。'
  ].join('\n')
}

export function sanitizeUserFacingText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (!INTERNAL_LEAK_MARKERS.some((marker) => trimmed.includes(marker))) {
    return trimmed
  }

  const filtered = trimmed
    .split('\n')
    .filter((line) => !INTERNAL_LEAK_MARKERS.some((marker) => line.includes(marker)))
    .join('\n')
    .trim()

  if (filtered && !INTERNAL_LEAK_MARKERS.some((marker) => filtered.includes(marker))) {
    return filtered
  }

  return ''
}

export function mergeVisibleAnswer(existing: string, answer: string): string {
  const trimmedExisting = existing.trim()
  const trimmedAnswer = answer.trim()
  if (!trimmedExisting) return trimmedAnswer
  if (!trimmedAnswer) return trimmedExisting
  return `${trimmedExisting}\n\n${trimmedAnswer}`
}
