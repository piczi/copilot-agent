import {
  Annotation,
  END,
  START,
  StateGraph,
  messagesStateReducer,
  type CompiledStateGraph,
  type LangGraphRunnableConfig
} from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  type BaseMessage
} from '@langchain/core/messages'
import type { LLMConfig } from '@/shared/types'
import { SYSTEM_PROMPT } from '@/agent/prompts/system'
import { MAX_TOOL_TURNS } from './constants'
import { createChatModel } from './model'
import { getRuntimePlatformInstruction } from './platform'
import { createPrefetchedMessages } from './prefetch'
import { ALL_TOOLS } from './tools'
import { getCheckpointer } from './checkpointer'
import type { AgentRuntimeContext } from './context'
import { RUNTIME_CONTEXT_KEY, getRuntimeContext } from './context'
import { createContentRouter } from './content-router'

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => []
  })
})

let compiledGraph: CompiledStateGraph<typeof AgentState.State, typeof AgentState.Update> | null = null

const VISUAL_FENCE_PATTERN = /```visual:[\w]+\n[\s\S]*?\n```/

function resolveAssistantContent(
  visibleContent: string,
  gathered: AIMessageChunk | undefined
): string | unknown {
  if (VISUAL_FENCE_PATTERN.test(visibleContent)) {
    return visibleContent
  }

  const gatheredContent = gathered && typeof gathered.content === 'string'
    ? gathered.content
    : ''

  return visibleContent.length > gatheredContent.length
    ? visibleContent
    : (gathered?.content ?? visibleContent)
}

async function prefetchNode(state: typeof AgentState.State): Promise<{ messages: BaseMessage[] }> {
  const lastMessage = state.messages[state.messages.length - 1]
  if (!lastMessage || !HumanMessage.isInstance(lastMessage)) {
    return { messages: [] }
  }

  const text = typeof lastMessage.content === 'string' ? lastMessage.content : ''
  const prefetched = await createPrefetchedMessages(text)
  if (!prefetched) {
    return { messages: [] }
  }

  return {
    messages: [
      ...state.messages.slice(0, -1),
      ...prefetched
    ]
  }
}

function createAgentNode(llmConfig: LLMConfig) {
  const model = createChatModel(llmConfig).bindTools(ALL_TOOLS)

  return async (state: typeof AgentState.State, config: LangGraphRunnableConfig) => {
    const runtime = getRuntimeContext(config)
    const emit = runtime?.emit
    const contentRouter = emit ? createContentRouter(emit) : null
    let reasoningStarted = false
    let gathered: AIMessageChunk | undefined

    const stream = await model.stream(state.messages, config)
    for await (const chunk of stream) {
      if (!AIMessageChunk.isInstance(chunk)) continue
      gathered = gathered ? gathered.concat(chunk) : chunk

      if (!emit || !contentRouter) continue

      const reasoning = typeof chunk.additional_kwargs?.reasoning_content === 'string'
        ? chunk.additional_kwargs.reasoning_content
        : ''
      if (reasoning) {
        if (!reasoningStarted) reasoningStarted = true
        emit({ type: 'thinking', chunk: reasoning })
      }

      const textChunk = typeof chunk.content === 'string' ? chunk.content : ''
      if (textChunk) {
        if (reasoningStarted) {
          reasoningStarted = false
          emit({ type: 'thinking_done' })
        }
        contentRouter.push(textChunk)
        if (runtime) {
          runtime.visibleTextRef.current += textChunk
        }
      }
    }

    contentRouter?.flush()
    if (reasoningStarted) {
      emit?.({ type: 'thinking_done' })
    }

    const visibleContent = runtime?.visibleTextRef.current ?? ''
    const finalContent = resolveAssistantContent(visibleContent, gathered)

    const response = gathered
      ? new AIMessage({
        content: finalContent,
        tool_calls: gathered.tool_calls,
        additional_kwargs: gathered.additional_kwargs
      })
      : new AIMessage({ content: visibleContent })

    return { messages: [response] }
  }
}

export function buildAgentGraph(llmConfig: LLMConfig) {
  const agentNode = createAgentNode(llmConfig)
  const toolNode = new ToolNode(ALL_TOOLS)

  const graph = new StateGraph(AgentState)
    .addNode('prefetch', prefetchNode)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addEdge(START, 'prefetch')
    .addEdge('prefetch', 'agent')
    .addConditionalEdges('agent', toolsCondition, ['tools', END])
    .addEdge('tools', 'agent')

  return graph.compile({
    checkpointer: getCheckpointer(),
    recursionLimit: MAX_TOOL_TURNS + 2
  })
}

export function getAgentGraph(llmConfig: LLMConfig) {
  compiledGraph = buildAgentGraph(llmConfig)
  return compiledGraph
}

export function buildInitialMessages(message: string, isNewThread: boolean): BaseMessage[] {
  const systemMessages = isNewThread
    ? [
      new SystemMessage(SYSTEM_PROMPT),
      new SystemMessage(getRuntimePlatformInstruction())
    ]
    : []

  return [
    ...systemMessages,
    new HumanMessage(message)
  ]
}

export function buildRunnableConfig(
  conversationId: string,
  runtime: AgentRuntimeContext
) {
  return {
    configurable: {
      thread_id: conversationId,
      [RUNTIME_CONTEXT_KEY]: runtime
    }
  }
}

export function extractReasoningFromMessage(message: BaseMessage): string {
  if (!AIMessage.isInstance(message)) return ''
  const reasoning = message.additional_kwargs?.reasoning_content
  return typeof reasoning === 'string' ? reasoning : ''
}
