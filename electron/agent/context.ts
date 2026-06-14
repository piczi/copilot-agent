import type { WebContents } from 'electron'
import type { CommandMode } from '@/shared/types'
import type { ChatStreamPayload } from '@/shared/ipc'

export interface AgentRuntimeContext {
  commandMode: CommandMode
  emit: (payload: ChatStreamPayload) => void
  signal: AbortSignal
  sender: WebContents
  requestId: string
  visibleTextRef: { current: string }
  requestApproval: (command: string, reason: string) => Promise<boolean>
  runCommand: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>
}

export const RUNTIME_CONTEXT_KEY = 'agentRuntime'

export function getRuntimeContext(config: { configurable?: Record<string, unknown> } | undefined): AgentRuntimeContext | undefined {
  return config?.configurable?.[RUNTIME_CONTEXT_KEY] as AgentRuntimeContext | undefined
}
