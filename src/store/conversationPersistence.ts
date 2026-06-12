import { Conversation } from '@/types'

const STORAGE_KEY = 'conversations'
const MAX_CONVERSATIONS = 50
const MAX_TITLE_LENGTH = 80
const MAX_MESSAGE_CONTENT_LENGTH = 40_000
const MAX_THINKING_LENGTH = 40_000

function asTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Date.now()
}

function truncateText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function sanitizeMessage(value: unknown): Conversation['messages'][number] | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const role = raw.role === 'user' || raw.role === 'assistant' ? raw.role : null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID()
  if (!role) return null

  const message: Conversation['messages'][number] = {
    id,
    role,
    content: truncateText(raw.content, MAX_MESSAGE_CONTENT_LENGTH),
    timestamp: asTimestamp(raw.timestamp)
  }

  const thinking = truncateText(raw.thinking, MAX_THINKING_LENGTH)
  if (thinking) {
    message.thinking = thinking
    message.thinkingComplete = raw.thinkingComplete === true
  }

  return message
}

function sanitizeConversation(value: unknown): Conversation | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const rawMessages = Array.isArray(raw.messages) ? raw.messages : []
  const messages = rawMessages
    .map(sanitizeMessage)
    .filter((message): message is Conversation['messages'][number] => Boolean(message))

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    title: truncateText(raw.title, MAX_TITLE_LENGTH) || '新对话',
    messages,
    createdAt: asTimestamp(raw.createdAt),
    updatedAt: asTimestamp(raw.updatedAt)
  }
}

function sortConversationsByActivity(a: Conversation, b: Conversation): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id)
}

function truncateConversations(conversations: Conversation[]): Conversation[] {
  // 按 updatedAt 排序，取最新的
  const sorted = conversations
    .map(sanitizeConversation)
    .filter((conversation): conversation is Conversation => Boolean(conversation))
    .sort(sortConversationsByActivity)
  const truncated = sorted.slice(0, MAX_CONVERSATIONS)
  return truncated
}

export async function loadConversations(): Promise<Conversation[]> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const stored = await window.electronAPI.getStoreValue(STORAGE_KEY)
      if (stored && Array.isArray(stored)) {
        return stored
          .map(sanitizeConversation)
          .filter((conversation): conversation is Conversation => Boolean(conversation))
          .slice(0, MAX_CONVERSATIONS)
      }
    }
  } catch (e) {
    console.warn('Failed to load conversations:', e)
  }
  return []
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const truncated = truncateConversations(conversations)
      await window.electronAPI.setStoreValue(STORAGE_KEY, truncated)
    }
  } catch (e) {
    console.warn('Failed to save conversations:', e)
  }
}
