/// <reference types="vite/client" />

import { CommandMode, ExecCommandResult, LLMConfig, LLMTestResult } from '@/types'

export interface ChatCompletionStreamEvent {
  type: 'thinking' | 'thinking_done' | 'text' | 'replace_text' | 'done' | 'error'
  chunk?: string
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      getStoreValue: (key: string) => Promise<unknown>
      setStoreValue: (key: string, value: unknown) => Promise<void>
      getLLMConfig: () => Promise<LLMConfig>
      saveLLMConfig: (config: LLMConfig) => Promise<void>
      testLLMConfig: (config: LLMConfig) => Promise<LLMTestResult>
      chatCompletion: (message: string) => Promise<string>
      chatCompletionStream: (
        requestId: string,
        message: string,
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
