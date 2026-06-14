import type { IpcMain } from 'electron'
import type Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import {
  deriveTitleFromMessage,
  getConversationIndex,
  getConversationMessageSnapshot,
  messagesToUiMessages,
  purgeConversationData,
  seedThreadMessages,
  removeConversationIndex,
  bumpConversationActivity,
  toConversation,
  upsertConversationIndex
} from '../agent'
import { buildAgentGraph } from '../agent/graph'
import { getCheckpointer } from '../agent/checkpointer'
import { getStoredLLMConfig } from '../agent/llm-config'

export function registerConversationIpc(ipcMain: IpcMain, store: Store): void {
  ipcMain.handle('list-conversations', () => getConversationIndex(store))

  ipcMain.handle('get-conversation-messages', async (_event, conversationId: string) => {
    if (!conversationId) return []

    const graph = buildAgentGraph(getStoredLLMConfig(store))
    const state = await graph.getState({ configurable: { thread_id: conversationId } })
    const checkpointMessages = messagesToUiMessages(state.values.messages || [])
    if (checkpointMessages.length > 0) {
      return checkpointMessages
    }

    const snapshotMessages = getConversationMessageSnapshot(store, conversationId)
    if (snapshotMessages.length > 0) {
      await seedThreadMessages(graph, conversationId, snapshotMessages)
    }
    return snapshotMessages
  })

  ipcMain.handle('create-conversation', async () => {
    const now = Date.now()
    const entry = {
      id: randomUUID(),
      title: '新对话',
      createdAt: now,
      updatedAt: now,
      isDraft: true
    }
    await upsertConversationIndex(store, entry, getCheckpointer())
    return toConversation(entry)
  })

  ipcMain.handle('delete-conversation', async (_event, conversationId: string) => {
    if (!conversationId) return false
    removeConversationIndex(store, conversationId)
    await purgeConversationData(store, conversationId, getCheckpointer())
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
      updatedAt: now,
      isDraft: false
    }
    await upsertConversationIndex(store, entry, getCheckpointer())
    return entry
  })

  ipcMain.handle('bump-conversation', async (_event, conversationId: string) => {
    if (!conversationId) return null
    return bumpConversationActivity(store, conversationId, getCheckpointer())
  })
}
