import type { IpcMain } from 'electron'
import type Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import {
  buildAgentGraph,
  deriveTitleFromMessage,
  getConversationIndex,
  messagesToUiMessages,
  migrateLegacyConversations,
  seedThreadMessages,
  removeConversationIndex,
  toConversation,
  upsertConversationIndex
} from '../agent'
import { getStoredLLMConfig } from '../agent/llm-config'
import { getCheckpointer } from '../agent/checkpointer'

export function registerConversationIpc(ipcMain: IpcMain, store: Store): void {
  ipcMain.handle('list-conversations', async () => {
    const graph = buildAgentGraph(getStoredLLMConfig(store))
    await migrateLegacyConversations(store, async (conversationId, messages) => {
      await seedThreadMessages(graph, conversationId, messages)
    })
    return getConversationIndex(store)
  })

  ipcMain.handle('get-conversation-messages', async (_event, conversationId: string) => {
    if (!conversationId) return []

    const graph = buildAgentGraph(getStoredLLMConfig(store))
    const state = await graph.getState({ configurable: { thread_id: conversationId } })
    return messagesToUiMessages(state.values.messages || [])
  })

  ipcMain.handle('create-conversation', async () => {
    const entry = {
      id: randomUUID(),
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    upsertConversationIndex(store, entry)
    return toConversation(entry)
  })

  ipcMain.handle('delete-conversation', async (_event, conversationId: string) => {
    if (!conversationId) return false
    removeConversationIndex(store, conversationId)
    try {
      const checkpointer = getCheckpointer()
      if ('deleteThread' in checkpointer && typeof checkpointer.deleteThread === 'function') {
        await checkpointer.deleteThread(conversationId)
      }
    } catch {
      // ignore checkpoint delete failures
    }
    return true
  })

  ipcMain.handle('touch-conversation', async (_event, conversationId: string, message: string) => {
    if (!conversationId) return null
    const index = getConversationIndex(store)
    const existing = index.find((item) => item.id === conversationId)
    const now = Date.now()
    const entry = {
      id: conversationId,
      title: existing?.title && existing.title !== '新对话'
        ? existing.title
        : deriveTitleFromMessage(message),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }
    upsertConversationIndex(store, entry)
    return entry
  })
}
