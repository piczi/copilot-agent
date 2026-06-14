import type { WebContents } from 'electron'
import { HumanMessage, type BaseMessage } from '@langchain/core/messages'
import type { CommandMode, LLMConfig } from '@/shared/types'
import type { ChatStreamPayload } from '@/shared/ipc'
import { sendChatStreamEvent, requestCommandApproval } from './approval'
import type { AgentRuntimeContext } from './context'
import {
  buildAgentGraph,
  buildInitialMessages,
  buildRunnableConfig
} from './graph'
import { runLocalCommand } from './llm-config'
import { syncVisibleTextToCheckpoint } from './messages'
import { createPrefetchedMessages } from './prefetch'

export interface RunAgentStreamParams {
  llmConfig: LLMConfig
  conversationId: string
  message: string
  mode: CommandMode
  sender: WebContents
  requestId: string
  signal: AbortSignal
}

function createRuntimeContext(params: RunAgentStreamParams, emit: (payload: ChatStreamPayload) => void): AgentRuntimeContext {
  return {
    commandMode: params.mode,
    emit,
    signal: params.signal,
    sender: params.sender,
    requestId: params.requestId,
    visibleTextRef: { current: '' },
    requestApproval: (command, reason) => requestCommandApproval(
      params.sender,
      params.requestId,
      command,
      reason,
      params.signal
    ),
    runCommand: (command) => runLocalCommand(command, params.signal)
  }
}

async function buildInputMessages(
  graph: ReturnType<typeof buildAgentGraph>,
  conversationId: string,
  message: string
): Promise<BaseMessage[]> {
  const state = await graph.getState({ configurable: { thread_id: conversationId } })
  const existingMessages = state.values.messages || []
  const isNewThread = existingMessages.length === 0

  const prefetched = await createPrefetchedMessages(message)
  if (prefetched) {
    const systemMessages = isNewThread
      ? buildInitialMessages(message, true).filter((item) => !(item instanceof HumanMessage))
      : []
    return [...systemMessages, ...prefetched]
  }

  return buildInitialMessages(message, isNewThread)
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
    await syncVisibleTextToCheckpoint(graph, config, runtime.visibleTextRef.current)
    emit({ type: 'done' })
  } catch (err) {
    if (params.signal.aborted) return

    try {
      await graph.invoke(
        {
          messages: [
            new HumanMessage([
              '上一轮模型或工具调用失败。不要把原始错误直接展示给用户。',
              `错误摘要：${err instanceof Error ? err.message : String(err)}`,
              '请基于已有上下文继续给出有帮助的回答；请尝试其他可用方式获取数据后再回答；仅在合理途径都失败后才说明暂时无法完成。'
            ].join('\n'))
          ]
        },
        {
          ...config,
          signal: params.signal
        }
      )
      await syncVisibleTextToCheckpoint(graph, config, runtime.visibleTextRef.current)
      emit({ type: 'done' })
    } catch {
      emit({ type: 'text', chunk: '请求暂时失败，我已经尝试恢复但仍无法完成这次回答。' })
      emit({ type: 'done' })
    }
  }
}
