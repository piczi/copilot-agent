/// <reference types="vite/client" />

import { ChatHistoryMessage, CommandMode, ExecCommandResult, LLMConfig, LLMTestResult } from '@/types'

export interface ChatCompletionStreamEvent {
  type: 'thinking' | 'thinking_done' | 'text' | 'replace_text' | 'approval_required' | 'done' | 'error'
  chunk?: string
  error?: string
  approvalId?: string
  command?: string
  reason?: string
}

declare global {
  interface Window {
    electronAPI: {
      getStoreValue: (key: string) => Promise<unknown>
      setStoreValue: (key: string, value: unknown) => Promise<void>
      getLLMConfig: () => Promise<LLMConfig>
      saveLLMConfig: (config: LLMConfig) => Promise<void>
      testLLMConfig: (config: LLMConfig) => Promise<LLMTestResult>
      chatCompletion: (
        message: string,
        options?: { history?: ChatHistoryMessage[] }
      ) => Promise<string>
      chatCompletionStream: (
        requestId: string,
        message: string,
        options: { mode?: CommandMode; history?: ChatHistoryMessage[] },
        onEvent: (event: ChatCompletionStreamEvent) => void
      ) => (cancel?: boolean) => void
      execCommand: (
        command: string,
        options?: { cwd?: string; mode?: CommandMode; approvalToken?: string }
      ) => Promise<ExecCommandResult>
    }
  }
}

export {}
