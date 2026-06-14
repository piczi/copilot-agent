import type { WebContents } from 'electron'
import type { CommandMode } from '@/shared/types'
import type { ApprovalKind, ChatStreamPayload } from '@/shared/ipc'

export interface AgentRuntimeContext {
  commandMode: CommandMode
  emit: (payload: ChatStreamPayload) => void
  signal: AbortSignal
  sender: WebContents
  requestId: string
  visibleTextRef: { current: string }
  requestApproval: (command: string, reason: string, kind?: ApprovalKind) => Promise<boolean>
  runCommand: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>
}

export const RUNTIME_CONTEXT_KEY = 'agentRuntime'

type ConfigLike = {
  configurable?: Record<string, unknown>
  config?: { configurable?: Record<string, unknown> }
}

export function getRuntimeContext(config: ConfigLike | undefined): AgentRuntimeContext | undefined {
  const configurable = config?.configurable ?? config?.config?.configurable
  return configurable?.[RUNTIME_CONTEXT_KEY] as AgentRuntimeContext | undefined
}
