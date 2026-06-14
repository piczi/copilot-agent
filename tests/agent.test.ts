import { describe, expect, it } from 'vitest'
import {
  extractWeatherCity,
  isCryptoQuery,
  isExchangeRateQuery,
  isGoldQuery,
  isWeatherQuery
} from '../electron/agent/prefetch'
import { isSafeReadOnlyCommand, restrictedCommandNeedsApproval } from '../electron/agent/security/commandPolicy'
import { resolveAllowedPath } from '../electron/agent/security/pathPolicy'
import { deriveTitleFromMessage } from '../electron/agent/conversation-index'
import { isVisualType } from '../src/shared/visual-types'

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
})

describe('visual types', () => {
  it('recognizes supported visual types', () => {
    expect(isVisualType('line_chart')).toBe(true)
    expect(isVisualType('unknown')).toBe(false)
  })
})
