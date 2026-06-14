import type Store from 'electron-store'
import { buildAgentGraph } from './graph'
import { getCheckpointer } from './checkpointer'
import { LEGACY_CONVERSATIONS_KEY } from './constants'
import { getStoredLLMConfig } from './llm-config'
import { migrateLegacyConversations, pruneConversationIndex } from './conversation-index'
import { seedThreadMessages } from './messages'

export async function initializeConversationStorage(store: Store): Promise<void> {
  const graph = buildAgentGraph(getStoredLLMConfig(store))
  await migrateLegacyConversations(store, async (conversationId, messages) => {
    await seedThreadMessages(graph, conversationId, messages)
  })

  if (store.get(LEGACY_CONVERSATIONS_KEY) !== undefined) {
    store.delete(LEGACY_CONVERSATIONS_KEY)
  }

  await pruneConversationIndex(store, getCheckpointer())
}
