import { create } from 'zustand'
import { CommandMode, Conversation, Message } from '@/types'
import type { ConversationIndexEntry } from '@/shared/ipc'

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string
  isLoading: boolean
  inputText: string
  commandMode: CommandMode
  abortController: AbortController | null

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

  createConversation: () => Promise<string>
  deleteConversation: (id: string) => Promise<void>
  setActiveConversation: (id: string) => Promise<void>
  loadConversations: () => Promise<void>
  touchConversation: (conversationId: string, message: string) => Promise<void>
}

const DEFAULT_TITLE = '新对话'

function getInitialCommandMode(): CommandMode {
  if (typeof window === 'undefined') return 'restricted'
  return window.localStorage.getItem('command-mode') === 'dangerous' ? 'dangerous' : 'restricted'
}

function sortConversationsByActivity(a: Conversation, b: Conversation): number {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id)
}

function isEmptyConversation(conversation: Conversation): boolean {
  return conversation.messages.length === 0
}

function indexToConversation(entry: ConversationIndexEntry, messages: Message[] = []): Conversation {
  return {
    id: entry.id,
    title: entry.title || DEFAULT_TITLE,
    messages,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }
}

function updateConversation(
  conversations: Conversation[],
  id: string,
  updater: (conv: Conversation) => Conversation
): Conversation[] {
  return conversations.map((c) => (c.id === id ? updater(c) : c))
}

async function fetchMessages(conversationId: string): Promise<Message[]> {
  if (typeof window === 'undefined' || !window.electronAPI?.getConversationMessages) {
    return []
  }
  return window.electronAPI.getConversationMessages(conversationId)
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

  createConversation: async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.createConversation) {
      const emptyIds = get().conversations
        .filter(isEmptyConversation)
        .map((conversation) => conversation.id)
      await Promise.all(
        emptyIds.map((emptyId) => window.electronAPI!.deleteConversation(emptyId))
      )

      const created = await window.electronAPI.createConversation()
      set((state) => ({
        conversations: [
          created,
          ...state.conversations.filter((item) => !emptyIds.includes(item.id))
        ],
        activeConversationId: created.id,
        inputText: '',
        isLoading: false,
        abortController: null
      }))
      return created.id
    }

    const fallback: Conversation = {
      id: crypto.randomUUID(),
      title: DEFAULT_TITLE,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    set({
      conversations: [fallback, ...get().conversations],
      activeConversationId: fallback.id,
      inputText: '',
      isLoading: false,
      abortController: null
    })
    return fallback.id
  },

  deleteConversation: async (id) => {
    if (typeof window !== 'undefined' && window.electronAPI?.deleteConversation) {
      await window.electronAPI.deleteConversation(id)
    }

    const { activeConversationId, conversations } = get()
    const wasActive = activeConversationId === id
    const filtered = conversations.filter((c) => c.id !== id)

    if (filtered.length === 0) {
      set({
        conversations: [],
        activeConversationId: '',
        inputText: '',
        isLoading: false,
        abortController: null
      })
      await get().createConversation()
      return
    }

    const newActiveId = wasActive
      ? [...filtered].sort(sortConversationsByActivity)[0]?.id || ''
      : activeConversationId

    set({
      conversations: filtered,
      activeConversationId: newActiveId,
      inputText: '',
      isLoading: false,
      abortController: null
    })

    if (wasActive && newActiveId) {
      await get().setActiveConversation(newActiveId)
    }
  },

  setActiveConversation: async (id) => {
    if (get().isLoading) return
    const messages = await fetchMessages(id)
    set((state) => ({
      conversations: updateConversation(state.conversations, id, (conversation) => ({
        ...conversation,
        messages
      })),
      activeConversationId: id,
      inputText: '',
      isLoading: false,
      abortController: null
    }))
  },

  loadConversations: async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.listConversations) {
      if (get().conversations.length === 0) {
        await get().createConversation()
      }
      return
    }

    const index = await window.electronAPI.listConversations()
    let conversations = index.map((entry) => indexToConversation(entry))

    if (conversations.length === 0) {
      const created = await window.electronAPI.createConversation()
      conversations = [created]
    }

    const activeConversationId = conversations[0]?.id || ''
    const messages = activeConversationId
      ? await fetchMessages(activeConversationId)
      : []

    set({
      conversations: conversations.map((conversation, idx) => (
        idx === 0 ? { ...conversation, messages } : conversation
      )),
      activeConversationId
    })
  },

  touchConversation: async (conversationId, message) => {
    if (typeof window !== 'undefined' && window.electronAPI?.touchConversation) {
      const entry = await window.electronAPI.touchConversation(conversationId, message)
      if (!entry) return
      set((state) => ({
        conversations: state.conversations.map((conversation) => (
          conversation.id === conversationId
            ? { ...conversation, title: entry.title, updatedAt: entry.updatedAt }
            : conversation
        ))
      }))
    }
  }
}))
