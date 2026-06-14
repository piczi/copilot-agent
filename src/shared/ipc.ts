import type { CommandMode } from './types'

export const APPROVAL_TTL_MS = 60_000

export type ApprovalKind = 'command' | 'url'

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
  requestId?: string
  approvalId?: string
  command?: string
  reason?: string
  approvalKind?: ApprovalKind
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
  isDraft?: boolean
}

const DEFAULT_CONVERSATION_TITLE = '新对话'

export function isDraftConversationEntry(entry: ConversationIndexEntry): boolean {
  if (entry.isDraft === true) return true
  if (entry.isDraft === false) return false
  return entry.title === DEFAULT_CONVERSATION_TITLE && entry.updatedAt === entry.createdAt
}
