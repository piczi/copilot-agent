import type { CommandMode } from './types'

export type ChatStreamPayloadType =
  | 'thinking'
  | 'thinking_done'
  | 'text'
  | 'replace_text'
  | 'approval_required'
  | 'done'
  | 'error'

export interface ChatStreamPayload {
  type: ChatStreamPayloadType
  chunk?: string
  error?: string
  approvalId?: string
  command?: string
  reason?: string
}

export type ChatCompletionStreamEvent = ChatStreamPayload

export interface ChatStreamOptions {
  conversationId: string
  mode?: CommandMode
}

export interface ConversationIndexEntry {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
