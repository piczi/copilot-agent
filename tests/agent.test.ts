import { describe, expect, it } from 'vitest'
import {
  buildErrorRecoveryPrompt,
  isInternalMessage,
  sanitizeUserFacingText
} from '../electron/agent/internal-messages'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { messagesToUiMessages } from '../electron/agent/messages'
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
  getConversationMessageSnapshot,
  migrateLegacyConversations,
  removeConversationMessageSnapshot,
  upsertConversationIndex,
  upsertConversationMessageSnapshot
} from '../electron/agent/conversation-index'
import { isPrivateIp, validateFetchUrl, fetchUrlNeedsApproval } from '../electron/agent/security/urlPolicy'
import {
  isLikelyFactualRequest,
  isLikelyRefusal,
  shouldRetryRefusal
} from '../electron/agent/refusal-guard'
import { isVisualType } from '../src/shared/visual-types'

function createMemoryStore() {
  const values = new Map<string, unknown>()
  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => {
      values.set(key, value)
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

  it('requires approval for risky commands', () => {
    expect(restrictedCommandNeedsApproval('rm -rf tmp')).toBe(true)
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

  it('stores and removes conversation message snapshots', () => {
    const store = createMemoryStore()
    upsertConversationIndex(store as never, {
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
    upsertConversationIndex(store as never, {
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
