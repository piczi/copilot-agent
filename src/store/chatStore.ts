import { create } from 'zustand'
import { CommandMode, Conversation, Message } from '@/types'
import { loadConversations, saveConversations } from './conversationPersistence'

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string
  isLoading: boolean
  inputText: string
  commandMode: CommandMode
  abortController: AbortController | null

  // Message mutations (keep existing signatures, route through active conversation)
  addMessage: (message: Message) => void
  addStreamingMessage: (message: Message) => void
  appendToMessage: (id: string, chunk: string, conversationId?: string) => void
  appendToThinking: (id: string, chunk: string, conversationId?: string) => void
  setThinkingComplete: (id: string, complete: boolean, conversationId?: string) => void
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string) => void
  setLoading: (loading: boolean) => void
  setInputText: (text: string) => void
  setCommandMode: (mode: CommandMode) => void
  setAbortController: (controller: AbortController | null) => void
  abort: () => void

  // Conversation management
  createConversation: () => string
  deleteConversation: (id: string) => void
  setActiveConversation: (id: string) => void
  loadConversations: () => Promise<void>
  persistConversations: () => Promise<void>
}

const DEFAULT_TITLE = '新对话'

function getInitialCommandMode(): CommandMode {
  if (typeof window === 'undefined') return 'restricted'
  return window.localStorage.getItem('command-mode') === 'dangerous' ? 'dangerous' : 'restricted'
}

function createEmptyConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: DEFAULT_TITLE,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

function isEmptyConversation(conversation: Conversation): boolean {
  return conversation.messages.length === 0
}

function ensureSingleEmptyConversation(conversations: Conversation[]): {
  conversations: Conversation[]
  activeConversationId: string
  changed: boolean
} {
  const sorted = [...conversations].sort(sortConversationsByActivity)
  const emptyConversation = sorted.find(isEmptyConversation)

  if (!emptyConversation) {
    const newConv = createEmptyConversation()
    return {
      conversations: [newConv, ...sorted],
      activeConversationId: newConv.id,
      changed: true
    }
  }

  const now = Date.now()
  const activeEmptyConversation = {
    ...emptyConversation,
    title: emptyConversation.title || DEFAULT_TITLE,
    updatedAt: now
  }
  const nonEmptyConversations = sorted.filter((conversation) => !isEmptyConversation(conversation))

  return {
    conversations: [activeEmptyConversation, ...nonEmptyConversations],
    activeConversationId: activeEmptyConversation.id,
    changed: sorted[0]?.id !== activeEmptyConversation.id || sorted.some((conversation) => (
      isEmptyConversation(conversation) && conversation.id !== activeEmptyConversation.id
    ))
  }
}

function mergeConversations(
  storedConversations: Conversation[],
  currentConversations: Conversation[]
): Conversation[] {
  if (currentConversations.length === 0) return storedConversations

  const byId = new Map<string, Conversation>()
  storedConversations.forEach((conversation) => byId.set(conversation.id, conversation))
  currentConversations.forEach((conversation) => byId.set(conversation.id, conversation))
  return Array.from(byId.values())
}

function updateConversation(
  conversations: Conversation[],
  id: string,
  updater: (conv: Conversation) => Conversation
): Conversation[] {
  return conversations.map((c) => (c.id === id ? updater(c) : c))
}

function sortConversationsByActivity(a: Conversation, b: Conversation): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id)
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: '',
  isLoading: false,
  inputText: '',
  commandMode: getInitialCommandMode(),
  abortController: null,

  addMessage: (message) =>
    set((state) => {
      const convId = state.activeConversationId
      const conv = state.conversations.find((c) => c.id === convId)
      if (!conv) return {}
      const isFirstUserMsg =
        message.role === 'user' &&
        conv.title === DEFAULT_TITLE &&
        conv.messages.filter((m) => m.role === 'user').length === 0
      const newTitle = isFirstUserMsg
        ? message.content.slice(0, 30) + (message.content.length > 30 ? '...' : '')
        : conv.title
      return {
        conversations: updateConversation(state.conversations, convId, (c) => ({
          ...c,
          title: newTitle,
          messages: [...c.messages, message],
          updatedAt: Date.now()
        }))
      }
    }),

  addStreamingMessage: (message) =>
    set((state) => {
      const convId = state.activeConversationId
      return {
        conversations: updateConversation(state.conversations, convId, (c) => ({
          ...c,
          messages: [...c.messages, message],
          updatedAt: Date.now()
        })),
        isLoading: true
      }
    }),

  appendToMessage: (id, chunk, conversationId) =>
    set((state) => {
      const convId = conversationId || state.activeConversationId
      return {
        conversations: updateConversation(state.conversations, convId, (c) => ({
          ...c,
          messages: c.messages.map((msg) =>
            msg.id === id ? { ...msg, content: msg.content + chunk } : msg
          )
        }))
      }
    }),

  appendToThinking: (id, chunk, conversationId) =>
    set((state) => {
      const convId = conversationId || state.activeConversationId
      return {
        conversations: updateConversation(state.conversations, convId, (c) => ({
          ...c,
          messages: c.messages.map((msg) =>
            msg.id === id ? { ...msg, thinking: (msg.thinking || '') + chunk } : msg
          )
        }))
      }
    }),

  setThinkingComplete: (id, complete, conversationId) =>
    set((state) => {
      const convId = conversationId || state.activeConversationId
      return {
        conversations: updateConversation(state.conversations, convId, (c) => ({
          ...c,
          messages: c.messages.map((msg) =>
            msg.id === id ? { ...msg, thinkingComplete: complete } : msg
          )
        }))
      }
    }),

  updateMessage: (id, updates, conversationId) =>
    set((state) => {
      const convId = conversationId || state.activeConversationId
      return {
        conversations: updateConversation(state.conversations, convId, (c) => ({
          ...c,
          messages: c.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          )
        }))
      }
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  setInputText: (text) => set({ inputText: text }),
  setCommandMode: (mode) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('command-mode', mode)
    }
    set({ commandMode: mode })
  },
  setAbortController: (controller) => set({ abortController: controller }),

  abort: () => {
    const controller = get().abortController
    if (controller) {
      controller.abort()
    }
  },

  createConversation: () => {
    const { conversations, activeConversationId } = ensureSingleEmptyConversation(get().conversations)
    set({
      conversations,
      activeConversationId,
      inputText: '',
      isLoading: false,
      abortController: null
    })
    return activeConversationId
  },

  deleteConversation: (id) => {
    set((state) => {
      const filtered = state.conversations.filter((c) => c.id !== id)
      const wasActive = state.activeConversationId === id
      let newActiveId = state.activeConversationId
      if (wasActive) {
        // 切换到最新剩余的会话
        const sorted = [...filtered].sort(sortConversationsByActivity)
        newActiveId = sorted[0]?.id || ''
      }
      // 如果全部删完了，自动创建新的
      if (filtered.length === 0) {
        const newConv = createEmptyConversation()
        return {
          conversations: [newConv],
          activeConversationId: newConv.id,
          inputText: '',
          isLoading: false,
          abortController: null
        }
      }
      return {
        conversations: filtered,
        activeConversationId: newActiveId,
        inputText: '',
        isLoading: false,
        abortController: null
      }
    })
  },

  setActiveConversation: (id) => {
    if (get().isLoading) return
    set({
      activeConversationId: id,
      inputText: '',
      isLoading: false,
      abortController: null
    })
  },

  loadConversations: async () => {
    const stored = await loadConversations()
    const merged = mergeConversations(stored, get().conversations)
    const nextSession = ensureSingleEmptyConversation(merged)
    set({
      conversations: nextSession.conversations,
      activeConversationId: nextSession.activeConversationId
    })
    if (nextSession.changed || merged.length !== stored.length) {
      await saveConversations(nextSession.conversations)
    }
  },

  persistConversations: async () => {
    await saveConversations(get().conversations)
  }
}))
