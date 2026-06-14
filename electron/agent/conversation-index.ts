import type Store from 'electron-store'
import type { ConversationIndexEntry } from '@/shared/ipc'
import type { Conversation, Message } from '@/shared/types'
import {
  CONVERSATION_INDEX_KEY,
  CONVERSATION_MESSAGE_SNAPSHOTS_KEY,
  LEGACY_CONVERSATIONS_KEY,
  MAX_CONVERSATIONS
} from './constants'

const DEFAULT_TITLE = '新对话'

export interface CheckpointerWithDelete {
  deleteThread?: (threadId: string) => Promise<void>
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Message>
  return (
    typeof item.id === 'string' &&
    (item.role === 'user' || item.role === 'assistant') &&
    typeof item.content === 'string' &&
    typeof item.timestamp === 'number'
  )
}

function isIndexEntry(value: unknown): value is ConversationIndexEntry {
  return Boolean(value && typeof value === 'object' && typeof (value as ConversationIndexEntry).id === 'string')
}

function readRawConversationIndex(store: Store): ConversationIndexEntry[] {
  const stored = store.get(CONVERSATION_INDEX_KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter(isIndexEntry)
}

function sortConversationEntries(entries: ConversationIndexEntry[]): ConversationIndexEntry[] {
  return [...entries].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id)
  )
}

function pruneSnapshotsToIndex(store: Store, index: ConversationIndexEntry[]): void {
  const allowedIds = new Set(index.map((item) => item.id))
  const stored = store.get(CONVERSATION_MESSAGE_SNAPSHOTS_KEY)
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return

  const current = stored as Record<string, unknown>
  const next: Record<string, Message[]> = {}
  for (const id of allowedIds) {
    const existing = current[id]
    if (Array.isArray(existing)) {
      next[id] = existing.filter(isMessage)
    }
  }
  store.set(CONVERSATION_MESSAGE_SNAPSHOTS_KEY, next)
}

export async function purgeConversationData(
  store: Store,
  conversationId: string,
  checkpointer?: CheckpointerWithDelete | null
): Promise<void> {
  removeConversationMessageSnapshot(store, conversationId)
  try {
    if (checkpointer && 'deleteThread' in checkpointer && typeof checkpointer.deleteThread === 'function') {
      await checkpointer.deleteThread(conversationId)
    }
  } catch {
    // ignore checkpoint delete failures
  }
}

export async function pruneConversationIndex(
  store: Store,
  checkpointer?: CheckpointerWithDelete | null
): Promise<ConversationIndexEntry[]> {
  const sorted = sortConversationEntries(readRawConversationIndex(store))
  const kept = sorted.slice(0, MAX_CONVERSATIONS)
  const evicted = sorted.slice(MAX_CONVERSATIONS)

  for (const entry of evicted) {
    await purgeConversationData(store, entry.id, checkpointer)
  }

  pruneSnapshotsToIndex(store, kept)
  store.set(CONVERSATION_INDEX_KEY, kept)
  return kept
}

export function getConversationIndex(store: Store): ConversationIndexEntry[] {
  return sortConversationEntries(readRawConversationIndex(store)).slice(0, MAX_CONVERSATIONS)
}

export async function upsertConversationIndex(
  store: Store,
  entry: ConversationIndexEntry,
  checkpointer?: CheckpointerWithDelete | null
): Promise<ConversationIndexEntry[]> {
  const current = readRawConversationIndex(store)
  const merged = sortConversationEntries([entry, ...current.filter((item) => item.id !== entry.id)])
  const kept = merged.slice(0, MAX_CONVERSATIONS)
  const evicted = merged.slice(MAX_CONVERSATIONS)

  for (const removed of evicted) {
    await purgeConversationData(store, removed.id, checkpointer)
  }

  pruneSnapshotsToIndex(store, kept)
  store.set(CONVERSATION_INDEX_KEY, kept)
  return kept
}

export function removeConversationIndex(store: Store, conversationId: string): ConversationIndexEntry[] {
  const next = readRawConversationIndex(store).filter((item) => item.id !== conversationId)
  store.set(CONVERSATION_INDEX_KEY, next)
  return sortConversationEntries(next).slice(0, MAX_CONVERSATIONS)
}

export function getConversationMessageSnapshot(store: Store, conversationId: string): Message[] {
  const stored = store.get(CONVERSATION_MESSAGE_SNAPSHOTS_KEY)
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return []

  const messages = (stored as Record<string, unknown>)[conversationId]
  if (!Array.isArray(messages)) return []
  return messages.filter(isMessage)
}

export function upsertConversationMessageSnapshot(
  store: Store,
  conversationId: string,
  messages: Message[]
): void {
  const stored = store.get(CONVERSATION_MESSAGE_SNAPSHOTS_KEY)
  const current = stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored as Record<string, unknown>
    : {}
  const index = getConversationIndex(store)
  const allowedIds = new Set(index.map((item) => item.id))
  allowedIds.add(conversationId)
  const next: Record<string, Message[]> = {}

  for (const id of allowedIds) {
    const existing = id === conversationId ? messages : current[id]
    if (Array.isArray(existing)) {
      next[id] = existing.filter(isMessage)
    }
  }

  store.set(CONVERSATION_MESSAGE_SNAPSHOTS_KEY, next)
}

export function removeConversationMessageSnapshot(store: Store, conversationId: string): void {
  const stored = store.get(CONVERSATION_MESSAGE_SNAPSHOTS_KEY)
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return

  const next = { ...(stored as Record<string, unknown>) }
  delete next[conversationId]
  store.set(CONVERSATION_MESSAGE_SNAPSHOTS_KEY, next)
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
  const legacy = store.get(LEGACY_CONVERSATIONS_KEY)
  if (!Array.isArray(legacy)) return existing

  const legacyConversations = legacy
    .filter((item): item is Conversation => Boolean(item && typeof item === 'object' && typeof (item as Conversation).id === 'string'))

  for (const conversation of legacyConversations) {
    if (conversation.messages?.length) {
      upsertConversationMessageSnapshot(store, conversation.id, conversation.messages)
    }
  }

  if (seedCheckpoint) {
    for (const conversation of legacyConversations) {
      if (conversation.messages?.length) {
        await seedCheckpoint(conversation.id, conversation.messages)
      }
    }
  }

  if (existing.length > 0) return existing

  const migrated = legacyConversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title || DEFAULT_TITLE,
    createdAt: conversation.createdAt || Date.now(),
    updatedAt: conversation.updatedAt || Date.now(),
    isDraft: !(conversation.messages?.length)
  }))

  if (migrated.length > 0) {
    store.set(CONVERSATION_INDEX_KEY, sortConversationEntries(migrated).slice(0, MAX_CONVERSATIONS))
  }

  return getConversationIndex(store)
}

export async function bumpConversationActivity(
  store: Store,
  conversationId: string,
  checkpointer?: CheckpointerWithDelete | null
): Promise<ConversationIndexEntry | null> {
  const existing = readRawConversationIndex(store).find((item) => item.id === conversationId)
  if (!existing) return null

  const entry = { ...existing, updatedAt: Date.now() }
  await upsertConversationIndex(store, entry, checkpointer)
  return entry
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
