import { randomUUID } from 'node:crypto'
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages'
import type { Message } from '@/shared/types'
import type { buildAgentGraph } from './graph'
import { isInternalMessage } from './internal-messages'

export function uiMessagesToBaseMessages(messages: Message[]): BaseMessage[] {
  const result: BaseMessage[] = []

  for (const message of messages) {
    if (message.role === 'user') {
      const content = message.content.trim()
      if (!content) continue
      result.push(new HumanMessage(content))
      continue
    }

    const content = message.content.trim()
    const reasoning = message.thinking?.trim()
    if (!content && !reasoning) continue

    result.push(new AIMessage({
      content,
      additional_kwargs: reasoning ? { reasoning_content: reasoning } : undefined
    }))
  }

  return result
}

export async function seedThreadMessages(
  graph: ReturnType<typeof buildAgentGraph>,
  conversationId: string,
  messages: Message[]
): Promise<void> {
  const config = { configurable: { thread_id: conversationId } }
  const state = await graph.getState(config)
  if ((state.values.messages || []).length > 0) return

  const baseMessages = uiMessagesToBaseMessages(messages)
  if (baseMessages.length === 0) return

  await graph.updateState(config, { messages: baseMessages })
}

export async function syncVisibleTextToCheckpoint(
  graph: ReturnType<typeof buildAgentGraph>,
  config: { configurable: { thread_id: string; [key: string]: unknown } },
  visibleText: string
): Promise<void> {
  const trimmed = visibleText.trim()
  if (!trimmed) return

  const state = await graph.getState(config)
  const messages = state.values.messages || []

  let lastAi: AIMessage | undefined
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (AIMessage.isInstance(messages[i])) {
      lastAi = messages[i] as AIMessage
      break
    }
  }
  if (!lastAi) return

  const currentContent = typeof lastAi.content === 'string' ? lastAi.content : ''
  if (currentContent === visibleText) return

  await graph.updateState(config, {
    messages: [
      new AIMessage({
        id: lastAi.id,
        content: visibleText,
        tool_calls: lastAi.tool_calls,
        additional_kwargs: lastAi.additional_kwargs
      })
    ]
  })
}

export function messagesToUiMessages(messages: BaseMessage[]): Message[] {
  const result: Message[] = []

  for (const message of messages) {
    if (isInternalMessage(message)) {
      continue
    }

    if (HumanMessage.isInstance(message)) {
      const content = typeof message.content === 'string' ? message.content : ''
      if (!content.trim()) continue
      result.push({
        id: randomUUID(),
        role: 'user',
        content,
        timestamp: Date.now()
      })
      continue
    }

    if (AIMessage.isInstance(message)) {
      const content = typeof message.content === 'string' ? message.content : ''
      const reasoning = typeof message.additional_kwargs?.reasoning_content === 'string'
        ? message.additional_kwargs.reasoning_content
        : undefined

      if (!content.trim() && !reasoning?.trim()) continue

      result.push({
        id: randomUUID(),
        role: 'assistant',
        content: content.trim(),
        thinking: reasoning,
        thinkingComplete: Boolean(reasoning),
        timestamp: Date.now()
      })
    }
  }

  return result
}

export function getLastUserText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (HumanMessage.isInstance(message) && typeof message.content === 'string') {
      return message.content
    }
  }
  return ''
}
