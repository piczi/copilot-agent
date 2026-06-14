import { describe, expect, it } from 'vitest'
import {
  buildErrorRecoveryPrompt,
  isInternalMessage,
  sanitizeUserFacingText
} from '../electron/agent/internal-messages'
import { HumanMessage, SystemMessage, ToolMessage, AIMessage } from '@langchain/core/messages'
import { messagesToUiMessages, prepareMessagesForModel } from '../electron/agent/messages'
import {
  extractWeatherCity,
  isCryptoQuery,
  isExchangeRateQuery,
  isGoldQuery,
  isWeatherQuery
} from '../electron/agent/prefetch'
import { isSafeReadOnlyCommand, restrictedCommandNeedsApproval } from '../electron/agent/security/commandPolicy'
import { resolveAllowedPath } from '../electron/agent/security/pathPolicy'
import {
  deriveTitleFromMessage,
  bumpConversationActivity,
  getConversationIndex,
  getConversationMessageSnapshot,
  migrateLegacyConversations,
  pruneConversationIndex,
  removeConversationMessageSnapshot,
  upsertConversationIndex,
  upsertConversationMessageSnapshot
} from '../electron/agent/conversation-index'
import { MAX_CONVERSATIONS } from '../electron/agent/constants'
import { isDraftConversationEntry } from '../src/shared/ipc'
import { isPrivateIp, validateFetchUrl, fetchUrlNeedsApproval } from '../electron/agent/security/urlPolicy'
import {
  isLikelyFactualRequest,
  isLikelyRefusal,
  shouldRetryRefusal,
  isSuccessfulToolResult,
  hasSuccessfulToolExecutionSince
} from '../electron/agent/refusal-guard'
import { isVisualType } from '../src/shared/visual-types'

function createMemoryStore() {
  const values = new Map<string, unknown>()
  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => {
      values.set(key, value)
    },
    delete: (key: string) => {
      values.delete(key)
    }
  }
}

describe('prefetch matchers', () => {
  it('detects weather queries', () => {
    expect(isWeatherQuery('北京天气怎么样')).toBe(true)
    expect(extractWeatherCity('北京天气怎么样')).toBe('北京')
  })

  it('detects gold and crypto queries', () => {
    expect(isGoldQuery('最近黄金价格')).toBe(true)
    expect(isCryptoQuery('比特币走势')).toBe(true)
  })

  it('detects exchange rate queries', () => {
    expect(isExchangeRateQuery('美元兑人民币汇率')).toBe(true)
  })
})

describe('command policy', () => {
  it('allows safe read-only commands', () => {
    expect(isSafeReadOnlyCommand('pwd')).toBe(true)
    expect(restrictedCommandNeedsApproval('pwd')).toBe(false)
  })

  it('allows read-only ConvertTo-Json pipelines without approval', () => {
    const command = "Get-CimInstance Win32_OperatingSystem | Select-Object Caption,OSArchitecture | ConvertTo-Json -Depth 3"
    expect(isSafeReadOnlyCommand(command)).toBe(true)
    expect(restrictedCommandNeedsApproval(command)).toBe(false)
  })

  it('allows read-only semicolon scripts without approval', () => {
    const command = [
      '$os=Get-CimInstance Win32_OperatingSystem|Select Caption',
      '[pscustomobject]@{os=$os}|ConvertTo-Json -Depth 3'
    ].join(';')
    expect(isSafeReadOnlyCommand(command)).toBe(true)
    expect(restrictedCommandNeedsApproval(command)).toBe(false)
  })

  it('requires approval for risky commands', () => {
    expect(restrictedCommandNeedsApproval('rm -rf tmp')).toBe(true)
    expect(restrictedCommandNeedsApproval('wmic cpu get Name /format:list')).toBe(true)
  })

  it('rejects disguised write pipelines ending with ConvertTo-Json', () => {
    const command = "Start-Process notepad | ConvertTo-Json"
    expect(isSafeReadOnlyCommand(command)).toBe(false)
    expect(restrictedCommandNeedsApproval(command)).toBe(true)
  })

  it('rejects disguised write assignments in semicolon scripts', () => {
    const command = "$x=Out-File evil.txt; [pscustomobject]@{done=$true}|ConvertTo-Json"
    expect(isSafeReadOnlyCommand(command)).toBe(false)
    expect(restrictedCommandNeedsApproval(command)).toBe(true)
  })
})

describe('path policy', () => {
  it('allows paths inside workspace', () => {
    const result = resolveAllowedPath('package.json')
    expect(result.ok).toBe(true)
  })
})

describe('conversation index', () => {
  it('derives title from first message', () => {
    expect(deriveTitleFromMessage('你好，帮我查一下天气')).toContain('你好')
  })

  it('stores and removes conversation message snapshots', async () => {
    const store = createMemoryStore()
    await upsertConversationIndex(store as never, {
      id: 'thread-1',
      title: '天气',
      createdAt: 1,
      updatedAt: 1
    })

    upsertConversationMessageSnapshot(store as never, 'thread-1', [
      { id: 'message-1', role: 'user', content: '北京天气', timestamp: 1 }
    ])

    expect(getConversationMessageSnapshot(store as never, 'thread-1')).toHaveLength(1)
    removeConversationMessageSnapshot(store as never, 'thread-1')
    expect(getConversationMessageSnapshot(store as never, 'thread-1')).toHaveLength(0)
  })

  it('preserves legacy messages as snapshots during migration', async () => {
    const store = createMemoryStore()
    store.set('conversations', [
      {
        id: 'legacy-thread',
        title: '旧会话',
        messages: [{ id: 'message-1', role: 'user', content: '你好', timestamp: 1 }],
        createdAt: 1,
        updatedAt: 1
      }
    ])

    await migrateLegacyConversations(store as never)

    expect(getConversationMessageSnapshot(store as never, 'legacy-thread')).toHaveLength(1)
  })

  it('backfills legacy snapshots even when the index already exists', async () => {
    const store = createMemoryStore()
    await upsertConversationIndex(store as never, {
      id: 'legacy-thread',
      title: '旧会话',
      createdAt: 1,
      updatedAt: 1
    })
    store.set('conversations', [
      {
        id: 'legacy-thread',
        title: '旧会话',
        messages: [{ id: 'message-1', role: 'assistant', content: '旧内容', timestamp: 1 }],
        createdAt: 1,
        updatedAt: 1
      }
    ])

    await migrateLegacyConversations(store as never)

    expect(getConversationMessageSnapshot(store as never, 'legacy-thread')[0]?.content).toBe('旧内容')
  })

  it('caps getConversationIndex to MAX_CONVERSATIONS', async () => {
    const store = createMemoryStore()
    const entries = Array.from({ length: MAX_CONVERSATIONS + 5 }, (_, index) => ({
      id: `thread-${index}`,
      title: `会话 ${index}`,
      createdAt: index,
      updatedAt: index
    }))
    store.set('conversation-index', entries)

    expect(getConversationIndex(store as never)).toHaveLength(MAX_CONVERSATIONS)
  })

  it('prunes excess conversations and removes their snapshots', async () => {
    const store = createMemoryStore()
    const deletedThreads: string[] = []
    const checkpointer = {
      deleteThread: async (threadId: string) => {
        deletedThreads.push(threadId)
      }
    }

    const entries = Array.from({ length: MAX_CONVERSATIONS + 3 }, (_, index) => ({
      id: `thread-${index}`,
      title: `会话 ${index}`,
      createdAt: index,
      updatedAt: index
    }))
    store.set('conversation-index', entries)
    for (const entry of entries) {
      upsertConversationMessageSnapshot(store as never, entry.id, [
        { id: `message-${entry.id}`, role: 'user', content: `内容 ${entry.id}`, timestamp: entry.updatedAt }
      ])
    }

    await pruneConversationIndex(store as never, checkpointer)

    expect(getConversationIndex(store as never)).toHaveLength(MAX_CONVERSATIONS)
    expect(getConversationMessageSnapshot(store as never, 'thread-0')).toHaveLength(0)
    expect(deletedThreads).toHaveLength(3)
  })

  it('tracks draft conversations via isDraft and legacy heuristics', async () => {
    const store = createMemoryStore()
    await upsertConversationIndex(store as never, {
      id: 'draft-thread',
      title: '新对话',
      createdAt: 100,
      updatedAt: 100,
      isDraft: true
    })
    await upsertConversationIndex(store as never, {
      id: 'active-thread',
      title: '新对话',
      createdAt: 100,
      updatedAt: 200,
      isDraft: false
    })

    const index = getConversationIndex(store as never)
    expect(isDraftConversationEntry(index.find((item) => item.id === 'draft-thread')!)).toBe(true)
    expect(isDraftConversationEntry(index.find((item) => item.id === 'active-thread')!)).toBe(false)
  })

  it('clears isDraft when conversation is touched', async () => {
    const store = createMemoryStore()
    await upsertConversationIndex(store as never, {
      id: 'draft-thread',
      title: '新对话',
      createdAt: 100,
      updatedAt: 100,
      isDraft: true
    })

    await upsertConversationIndex(store as never, {
      id: 'draft-thread',
      title: '你好',
      createdAt: 100,
      updatedAt: 200,
      isDraft: false
    })

    const entry = getConversationIndex(store as never).find((item) => item.id === 'draft-thread')
    expect(entry?.isDraft).toBe(false)
    expect(entry?.title).toBe('你好')
  })

  it('bumps conversation activity to the top while preserving isDraft', async () => {
    const store = createMemoryStore()
    await upsertConversationIndex(store as never, {
      id: 'older-thread',
      title: '旧会话',
      createdAt: 100,
      updatedAt: 200
    })
    await upsertConversationIndex(store as never, {
      id: 'draft-thread',
      title: '新对话',
      createdAt: 50,
      updatedAt: 50,
      isDraft: true
    })

    const bumped = await bumpConversationActivity(store as never, 'draft-thread')
    const index = getConversationIndex(store as never)

    expect(bumped?.updatedAt).toBeGreaterThan(200)
    expect(index[0]?.id).toBe('draft-thread')
    expect(index[0]?.isDraft).toBe(true)
  })
})

describe('visual types', () => {
  it('recognizes supported visual types', () => {
    expect(isVisualType('line_chart')).toBe(true)
    expect(isVisualType('unknown')).toBe(false)
  })
})

describe('url policy', () => {
  it('allows public https urls', () => {
    const result = validateFetchUrl('https://api.example.com/data')
    expect(result.ok).toBe(true)
  })

  it('blocks localhost and private ip urls', () => {
    expect(validateFetchUrl('http://localhost/test').ok).toBe(false)
    expect(validateFetchUrl('http://127.0.0.1/test').ok).toBe(false)
    expect(validateFetchUrl('http://192.168.1.1/test').ok).toBe(false)
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
  })

  it('requires approval in restricted mode', () => {
    expect(fetchUrlNeedsApproval('restricted')).toBe(true)
    expect(fetchUrlNeedsApproval('dangerous')).toBe(false)
  })
})

describe('refusal guard', () => {
  it('detects likely refusal responses', () => {
    expect(isLikelyRefusal('抱歉，我暂时无法完成这个请求。')).toBe(true)
    expect(isLikelyRefusal('北京今天晴，适合出行。')).toBe(false)
  })

  it('detects factual requests', () => {
    expect(isLikelyFactualRequest('帮我查一下苹果股价')).toBe(true)
    expect(isLikelyFactualRequest('你好')).toBe(false)
  })

  it('retries when factual request gets refusal without tools', () => {
    expect(shouldRetryRefusal('帮我查内存大小', '抱歉，我无法查看您的电脑信息。')).toBe(true)
    expect(shouldRetryRefusal('你好', '你好，有什么可以帮你？')).toBe(false)
  })

  it('skips retry when tools already succeeded for the request', () => {
    const messages = [
      new HumanMessage('帮我查内存大小'),
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call-1', name: 'exec_bash', args: { command: 'pwd' } }]
      }),
      new ToolMessage({
        content: JSON.stringify({ platform: 'Windows', command: 'pwd', output: '/tmp', exitCode: 0 }),
        tool_call_id: 'call-1'
      }),
      new AIMessage('抱歉，我暂时无法完成这个请求。')
    ]

    expect(isSuccessfulToolResult(JSON.stringify({ exitCode: 0, output: 'ok' }))).toBe(true)
    expect(isSuccessfulToolResult(JSON.stringify({ exitCode: -1, output: 'fail' }))).toBe(false)
    expect(hasSuccessfulToolExecutionSince(messages, 0)).toBe(true)
    expect(shouldRetryRefusal('帮我查内存大小', '抱歉，我暂时无法完成这个请求。', messages)).toBe(false)
  })

  it('retries when fetch_url returned an HTTP failure', () => {
    const messages = [
      new HumanMessage('帮我查一下这个 API'),
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call-1', name: 'fetch_url', args: { url: 'https://api.example.com/data' } }]
      }),
      new ToolMessage({
        content: JSON.stringify({ url: 'https://api.example.com/data', status: 404, ok: false, contentType: 'text/html', body: 'Not Found' }),
        tool_call_id: 'call-1'
      }),
      new AIMessage('抱歉，我暂时无法完成这个请求。')
    ]

    expect(isSuccessfulToolResult(JSON.stringify({ status: 404, ok: false, body: 'Not Found' }))).toBe(false)
    expect(hasSuccessfulToolExecutionSince(messages, 0)).toBe(false)
    expect(shouldRetryRefusal('帮我查一下这个 API', '抱歉，我暂时无法完成这个请求。', messages)).toBe(true)
  })
})

describe('message sanitization', () => {
  it('strips reasoning_content from prefetched assistant tool turns', () => {
    const messages = prepareMessagesForModel([
      new HumanMessage('明天杭州天气如何'),
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'fetch_weather_abc', name: 'fetch_weather', args: { city: '杭州' } }],
        additional_kwargs: { reasoning_content: '需要获取 "杭州" 的真实天气数据。' }
      }),
      new ToolMessage({ content: '{"city":"杭州"}', tool_call_id: 'fetch_weather_abc' })
    ])

    const assistant = messages[1] as AIMessage
    expect(assistant.additional_kwargs?.reasoning_content).toBeUndefined()
  })

  it('keeps reasoning_content on real model assistant turns', () => {
    const messages = prepareMessagesForModel([
      new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_real_1', name: 'fetch_weather', args: { city: '杭州' } }],
        additional_kwargs: { reasoning_content: 'real model reasoning' }
      })
    ])

    const assistant = messages[0] as AIMessage
    expect(assistant.additional_kwargs?.reasoning_content).toBe('real model reasoning')
  })

  it('dedupes consecutive identical human messages', () => {
    const messages = prepareMessagesForModel([
      new HumanMessage('明天杭州天气如何'),
      new HumanMessage('明天杭州天气如何'),
      new AIMessage({ content: 'ok' })
    ])

    expect(messages.filter((message) => HumanMessage.isInstance(message))).toHaveLength(1)
  })
})

describe('internal messages', () => {
  it('filters internal system and legacy human prompts from ui messages', () => {
    const messages = messagesToUiMessages([
      new HumanMessage('帮我查一下天气'),
      new SystemMessage({
        content: buildErrorRecoveryPrompt(new Error('tool_call mismatch')),
        additional_kwargs: { internal: true }
      }),
      new HumanMessage('上一轮模型或工具调用失败。不要把原始错误直接展示给用户。')
    ])

    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toBe('帮我查一下天气')
  })

  it('strips leaked recovery text before showing to users', () => {
    const leaked = [
      '上一轮模型或工具调用失败。不要把原始错误直接展示给用户。',
      '错误摘要：400 insufficient tool messages following tool_calls message',
      'https://docs.langchain.com/oss/javascript/langchain/errors/INVALID_TOOL_RESULTS/'
    ].join('\n')

    expect(sanitizeUserFacingText(leaked)).toBe('')
    expect(sanitizeUserFacingText('这是可以展示给用户的回答。')).toBe('这是可以展示给用户的回答。')
  })

  it('detects internal messages by marker', () => {
    expect(isInternalMessage(new SystemMessage({
      content: 'hidden',
      additional_kwargs: { internal: true }
    }))).toBe(true)
  })
})
