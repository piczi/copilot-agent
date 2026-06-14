import type { WebContents } from 'electron'
import type { CommandMode, LLMConfig, Message } from '@/shared/types'
import type { ChatStreamPayload } from '@/shared/ipc'
import { sendChatStreamEvent, requestCommandApproval } from './approval'
import type { AgentRuntimeContext } from './context'
import { RUNTIME_CONTEXT_KEY } from './context'
import {
  buildAgentGraph,
  buildInitialMessages,
  buildRunnableConfig
} from './graph'
import { runLocalCommand } from './llm-config'
import { messagesToUiMessages, syncVisibleTextToCheckpoint } from './messages'
import {
  buildErrorRecoveryPrompt,
  createInternalSystemMessage,
  mergeVisibleAnswer,
  sanitizeUserFacingText
} from './internal-messages'
import {
  REFUSAL_RETRY_PROMPT,
  getLastAssistantText,
  shouldRetryRefusal
} from './refusal-guard'

export interface RunAgentStreamParams {
  llmConfig: LLMConfig
  conversationId: string
  message: string
  mode: CommandMode
  sender: WebContents
  requestId: string
  signal: AbortSignal
  onMessagesUpdated?: (messages: Message[]) => void
}

function createRuntimeContext(params: RunAgentStreamParams, emit: (payload: ChatStreamPayload) => void): AgentRuntimeContext {
  return {
    commandMode: params.mode,
    emit,
    signal: params.signal,
    sender: params.sender,
    requestId: params.requestId,
    visibleTextRef: { current: '' },
    requestApproval: (command, reason, kind) => requestCommandApproval(
      params.sender,
      params.requestId,
      command,
      reason,
      params.signal,
      kind
    ),
    runCommand: (command) => runLocalCommand(command, params.signal)
  }
}

async function buildInputMessages(
  graph: ReturnType<typeof buildAgentGraph>,
  conversationId: string,
  message: string
) {
  const state = await graph.getState({ configurable: { thread_id: conversationId } })
  const existingMessages = state.values.messages || []
  const isNewThread = existingMessages.length === 0
  return buildInitialMessages(message, isNewThread)
}

function emitVisibleTextSnapshot(runtime: AgentRuntimeContext, emit: (payload: ChatStreamPayload) => void): void {
  const snapshot = runtime.visibleTextRef.current
  if (snapshot.trim()) {
    emit({ type: 'replace_text', chunk: snapshot })
  }
}

async function notifyMessagesUpdated(
  graph: ReturnType<typeof buildAgentGraph>,
  config: ReturnType<typeof buildRunnableConfig>,
  callback: ((messages: Message[]) => void) | undefined
): Promise<void> {
  if (!callback) return

  const state = await graph.getState(config)
  const messages = messagesToUiMessages(state.values.messages || [])
  if (messages.length > 0) {
    callback(messages)
  }
}

async function invokeWithInternalPrompt(
  graph: ReturnType<typeof buildAgentGraph>,
  config: ReturnType<typeof buildRunnableConfig>,
  runtime: AgentRuntimeContext,
  prompt: string
): Promise<void> {
  const preservedVisible = runtime.visibleTextRef.current
  const silentRuntime: AgentRuntimeContext = {
    ...runtime,
    emit: () => {},
    visibleTextRef: { current: '' }
  }
  const silentConfig = {
    ...config,
    configurable: {
      ...config.configurable,
      [RUNTIME_CONTEXT_KEY]: silentRuntime
    },
    signal: runtime.signal
  }

  await graph.invoke(
    { messages: [createInternalSystemMessage(prompt)] },
    silentConfig
  )

  const recoveryText = sanitizeUserFacingText(silentRuntime.visibleTextRef.current)
  runtime.visibleTextRef.current = mergeVisibleAnswer(preservedVisible, recoveryText)
}

async function maybeRetryRefusal(
  graph: ReturnType<typeof buildAgentGraph>,
  config: ReturnType<typeof buildRunnableConfig>,
  runtime: AgentRuntimeContext,
  userMessage: string
): Promise<boolean> {
  const state = await graph.getState(config)
  const messages = state.values.messages || []
  const assistantContent = getLastAssistantText(messages)
  if (!shouldRetryRefusal(userMessage, assistantContent, messages)) {
    return false
  }

  await invokeWithInternalPrompt(graph, config, runtime, REFUSAL_RETRY_PROMPT)
  return true
}

export async function runAgentStream(params: RunAgentStreamParams): Promise<void> {
  if (!params.llmConfig.apiKey) {
    throw new Error('请先配置 LLM API Key（点击左上角设置图标）')
  }
  if (!params.llmConfig.baseURL) {
    throw new Error('请先配置 Base URL')
  }

  const emit = (payload: ChatStreamPayload) => sendChatStreamEvent(params.sender, params.requestId, payload)
  const runtime = createRuntimeContext(params, emit)
  const graph = buildAgentGraph(params.llmConfig)
  const inputMessages = await buildInputMessages(graph, params.conversationId, params.message)
  const config = buildRunnableConfig(params.conversationId, runtime)

  try {
    await graph.invoke(
      { messages: inputMessages },
      {
        ...config,
        signal: params.signal
      }
    )

    const retried = await maybeRetryRefusal(graph, config, runtime, params.message)
    if (retried) {
      await syncVisibleTextToCheckpoint(graph, config, runtime.visibleTextRef.current)
      await notifyMessagesUpdated(graph, config, params.onMessagesUpdated)
      emitVisibleTextSnapshot(runtime, emit)
      emit({ type: 'done' })
      return
    }

    await syncVisibleTextToCheckpoint(graph, config, runtime.visibleTextRef.current)
    await notifyMessagesUpdated(graph, config, params.onMessagesUpdated)
    emitVisibleTextSnapshot(runtime, emit)
    emit({ type: 'done' })
  } catch (err) {
    if (params.signal.aborted) return

    try {
      await invokeWithInternalPrompt(
        graph,
        config,
        runtime,
        buildErrorRecoveryPrompt(err)
      )
      await syncVisibleTextToCheckpoint(graph, config, runtime.visibleTextRef.current)
      await notifyMessagesUpdated(graph, config, params.onMessagesUpdated)
      emitVisibleTextSnapshot(runtime, emit)
      emit({ type: 'done' })
    } catch {
      emit({ type: 'text', chunk: '请求暂时失败，我已经尝试恢复但仍无法完成这次回答。' })
      emit({ type: 'done' })
    }
  }
}
