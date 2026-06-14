import type Store from 'electron-store'
import type { ConversationIndexEntry } from '@/shared/ipc'
import type { Conversation, Message } from '@/shared/types'
import { CONVERSATION_INDEX_KEY, LEGACY_CONVERSATIONS_KEY } from './constants'

const DEFAULT_TITLE = '新对话'

export function getConversationIndex(store: Store): ConversationIndexEntry[] {
  const stored = store.get(CONVERSATION_INDEX_KEY)
  if (!Array.isArray(stored)) return []
  return stored
    .filter((item): item is ConversationIndexEntry => Boolean(item && typeof item === 'object' && typeof (item as ConversationIndexEntry).id === 'string'))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
}

export function upsertConversationIndex(
  store: Store,
  entry: ConversationIndexEntry
): ConversationIndexEntry[] {
  const current = getConversationIndex(store)
  const next = [entry, ...current.filter((item) => item.id !== entry.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
    .slice(0, 50)
  store.set(CONVERSATION_INDEX_KEY, next)
  return next
}

export function removeConversationIndex(store: Store, conversationId: string): ConversationIndexEntry[] {
  const next = getConversationIndex(store).filter((item) => item.id !== conversationId)
  store.set(CONVERSATION_INDEX_KEY, next)
  return next
}

export function deriveTitleFromMessage(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return DEFAULT_TITLE
  return trimmed.slice(0, 30) + (trimmed.length > 30 ? '...' : '')
}

export async function migrateLegacyConversations(
  store: Store,
  seedCheckpoint?: (conversationId: string, messages: Message[]) => Promise<void>
): Promise<ConversationIndexEntry[]> {
  const existing = getConversationIndex(store)
  if (existing.length > 0) return existing

  const legacy = store.get(LEGACY_CONVERSATIONS_KEY)
  if (!Array.isArray(legacy)) return []

  const legacyConversations = legacy
    .filter((item): item is Conversation => Boolean(item && typeof item === 'object' && typeof (item as Conversation).id === 'string'))

  const migrated = legacyConversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title || DEFAULT_TITLE,
    createdAt: conversation.createdAt || Date.now(),
    updatedAt: conversation.updatedAt || Date.now()
  }))

  if (migrated.length > 0) {
    store.set(CONVERSATION_INDEX_KEY, migrated)
  }

  if (seedCheckpoint) {
    for (const conversation of legacyConversations) {
      if (conversation.messages?.length) {
        await seedCheckpoint(conversation.id, conversation.messages)
      }
    }
  }

  return migrated
}

export function toConversation(entry: ConversationIndexEntry, messages: Message[] = []): Conversation {
  return {
    id: entry.id,
    title: entry.title || DEFAULT_TITLE,
    messages,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }
}
