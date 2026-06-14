/// <reference types="vite/client" />

import { CommandMode, ExecCommandResult, LLMConfig, LLMTestResult, Message } from '@/types'
import type { ChatCompletionStreamEvent, ConversationIndexEntry } from '@/shared/ipc'

declare global {
  interface Window {
    electronAPI: {
      getStoreValue: (key: string) => Promise<unknown>
      setStoreValue: (key: string, value: unknown) => Promise<void>
      getLLMConfig: () => Promise<LLMConfig>
      saveLLMConfig: (config: LLMConfig) => Promise<void>
      testLLMConfig: (config: LLMConfig) => Promise<LLMTestResult>
      chatCompletionStream: (
        requestId: string,
        message: string,
        options: { conversationId: string; mode?: CommandMode },
        onEvent: (event: ChatCompletionStreamEvent) => void
      ) => (cancel?: boolean) => void
      respondCommandApproval: (requestId: string, approvalId: string, approved: boolean) => void
      listConversations: () => Promise<ConversationIndexEntry[]>
      getConversationMessages: (conversationId: string) => Promise<Message[]>
      createConversation: () => Promise<{ id: string; title: string; messages: Message[]; createdAt: number; updatedAt: number }>
      deleteConversation: (conversationId: string) => Promise<boolean>
      touchConversation: (conversationId: string, message: string) => Promise<ConversationIndexEntry | null>
      execCommand: (
        command: string,
        options?: { cwd?: string; mode?: CommandMode; approvalToken?: string }
      ) => Promise<ExecCommandResult>
    }
  }
}

export type { ChatCompletionStreamEvent }

export {}
