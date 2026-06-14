import { randomUUID } from 'node:crypto'
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { fetchCrypto, resolveCoinId } from '@/services/crypto'
import { fetchExchangeRate } from '@/services/exchange-rate'
import { fetchGold } from '@/services/gold'
import { fetchWeather } from '@/services/weather'

const CURRENCY_ALIASES: Record<string, string> = {
  usd: 'USD',
  cny: 'CNY',
  rmb: 'CNY',
  eur: 'EUR',
  jpy: 'JPY',
  gbp: 'GBP',
  hkd: 'HKD',
  aud: 'AUD',
  cad: 'CAD',
  chf: 'CHF',
  美元: 'USD',
  美金: 'USD',
  人民币: 'CNY',
  欧元: 'EUR',
  日元: 'JPY',
  英镑: 'GBP',
  港币: 'HKD',
  港元: 'HKD'
}

const CRYPTO_NAME_PATTERNS: Array<[RegExp, string]> = [
  [/比特币|\bbitcoin\b|\bbtc\b/i, 'bitcoin'],
  [/以太坊|\bethereum\b|\beth\b/i, 'ethereum'],
  [/索拉纳|\bsolana\b|\bsol\b/i, 'solana'],
  [/狗狗币|\bdogecoin\b|\bdoge\b/i, 'dogecoin'],
  [/瑞波|\bripple\b|\bxrp\b/i, 'ripple'],
  [/艾达币|\bcardano\b|\bada\b/i, 'cardano']
]

export function isWeatherQuery(message: string): boolean {
  return /\bweather\b|\bforecast\b|天气|气温|温度|下雨|降雨|预报/i.test(message)
}

function cleanWeatherCityCandidate(value: string): string {
  return value
    .replace(/\b(in|for|at|of)\b/gi, ' ')
    .replace(/今天|明天|后天|大后天|现在|当前|最近|未来\d*天?|请问|帮我|查询|查一下|看看|一下|的|怎么样|如何/g, '')
    .replace(/[？?。！!,，：:\s]+/g, ' ')
    .trim()
}

export function extractWeatherCity(message: string): string {
  const keywordMatch = /天气|气温|温度|下雨|降雨|预报|\bweather\b|\bforecast\b/i.exec(message)
  if (!keywordMatch) return ''

  const before = cleanWeatherCityCandidate(message.slice(0, keywordMatch.index))
  if (before) return before

  return cleanWeatherCityCandidate(message.slice(keywordMatch.index + keywordMatch[0].length))
}

function normalizeCurrencyCode(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const alias = CURRENCY_ALIASES[trimmed.toLowerCase()] || CURRENCY_ALIASES[trimmed]
  if (alias) return alias
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase()
  return ''
}

export function isGoldQuery(message: string): boolean {
  if (isWeatherQuery(message)) return false
  return /黄金|金价|gold\s*price|\bxau\b|贵金属/i.test(message)
}

function extractGoldDays(message: string): number {
  return extractHistoryDays(message) || 7
}

export function isCryptoQuery(message: string): boolean {
  if (isWeatherQuery(message) || isGoldQuery(message)) return false
  return /加密货币|数字货币|虚拟币|币价|行情|\bcrypto\b/i.test(message)
    || CRYPTO_NAME_PATTERNS.some(([pattern]) => pattern.test(message))
}

export function extractCryptoCoinId(message: string): string {
  for (const [pattern, coinId] of CRYPTO_NAME_PATTERNS) {
    if (pattern.test(message)) return coinId
  }
  return ''
}

export function isExchangeRateQuery(message: string): boolean {
  if (isWeatherQuery(message) || isCryptoQuery(message) || isGoldQuery(message)) return false
  if (/汇率|exchange\s*rate|外汇|换算/i.test(message)) return true
  if (/兑(?:换|率)?/.test(message) && /美元|人民币|欧元|日元|英镑|USD|CNY|EUR|JPY|GBP/i.test(message)) {
    return true
  }
  return /\b(USD|CNY|EUR|JPY|GBP|HKD|AUD|CAD|CHF)\b[^.\n]{0,24}\b(USD|CNY|EUR|JPY|GBP|HKD|AUD|CAD|CHF)\b/i.test(message)
}

function extractExchangeRatePair(message: string): { base: string; target: string; days?: number } | null {
  const isoPair = message.match(/\b(USD|CNY|EUR|JPY|GBP|HKD|AUD|CAD|CHF)\b\s*(?:\/|对|兑|to|->)\s*\b(USD|CNY|EUR|JPY|GBP|HKD|AUD|CAD|CHF)\b/i)
  if (isoPair) {
    return {
      base: isoPair[1].toUpperCase(),
      target: isoPair[2].toUpperCase(),
      days: extractHistoryDays(message)
    }
  }

  const zhPair = message.match(/(美元|美金|人民币|欧元|日元|英镑|港币|港元)\s*(?:对|兑|换|\/)\s*(美元|美金|人民币|欧元|日元|英镑|港币|港元)/)
  if (zhPair) {
    const base = normalizeCurrencyCode(zhPair[1])
    const target = normalizeCurrencyCode(zhPair[2])
    if (base && target) {
      return { base, target, days: extractHistoryDays(message) }
    }
  }

  const codes = [...message.matchAll(/\b(USD|CNY|EUR|JPY|GBP|HKD|AUD|CAD|CHF)\b/gi)]
    .map((match) => match[1].toUpperCase())
  if (codes.length >= 2) {
    return {
      base: codes[0],
      target: codes[1],
      days: extractHistoryDays(message)
    }
  }

  return null
}

export function extractHistoryDays(message: string): number | undefined {
  const match = /(?:最近|近|过去)?\s*(\d{1,3})\s*天/.exec(message)
  if (!match) return undefined
  const days = Number(match[1])
  return Number.isFinite(days) && days > 0 ? days : undefined
}

async function buildPrefetchedToolTurn(
  message: string,
  toolName: string,
  args: Record<string, unknown>,
  reasoning: string,
  fetchResult: () => Promise<string>
): Promise<BaseMessage[]> {
  const toolCallId = `${toolName}_${randomUUID()}`
  return [
    new HumanMessage(message),
    new AIMessage({
      content: '',
      tool_calls: [{
        id: toolCallId,
        name: toolName,
        args
      }],
      additional_kwargs: { reasoning_content: reasoning }
    }),
    new ToolMessage({
      content: await fetchResult(),
      tool_call_id: toolCallId,
      name: toolName
    })
  ]
}

async function createWeatherToolMessages(message: string): Promise<BaseMessage[] | undefined> {
  if (!isWeatherQuery(message)) return undefined
  const city = extractWeatherCity(message)
  if (!city) return undefined

  return buildPrefetchedToolTurn(
    message,
    'fetch_weather',
    { city },
    `需要获取 "${city}" 的真实天气数据。`,
    async () => JSON.stringify(await fetchWeather(city), null, 2)
  )
}

async function createCryptoToolMessages(message: string): Promise<BaseMessage[] | undefined> {
  if (!isCryptoQuery(message)) return undefined
  const coinId = extractCryptoCoinId(message)
  if (!coinId) return undefined

  return buildPrefetchedToolTurn(
    message,
    'fetch_crypto',
    { coinId },
    `需要获取 "${coinId}" 的真实加密货币行情数据。`,
    async () => JSON.stringify(await fetchCrypto(resolveCoinId(coinId)), null, 2)
  )
}

async function createGoldToolMessages(message: string): Promise<BaseMessage[] | undefined> {
  if (!isGoldQuery(message)) return undefined
  const days = extractGoldDays(message)
  return buildPrefetchedToolTurn(
    message,
    'fetch_gold',
    { days },
    `需要获取最近 ${days} 天的真实黄金价格数据。`,
    async () => JSON.stringify(await fetchGold(days), null, 2)
  )
}

async function createExchangeRateToolMessages(message: string): Promise<BaseMessage[] | undefined> {
  if (!isExchangeRateQuery(message)) return undefined
  const pair = extractExchangeRatePair(message)
  if (!pair) return undefined

  const args: Record<string, unknown> = {
    base: pair.base,
    target: pair.target
  }
  if (pair.days) args.days = pair.days

  return buildPrefetchedToolTurn(
    message,
    'fetch_exchange_rate',
    args,
    `需要获取 ${pair.base}/${pair.target} 的真实汇率数据。`,
    async () => JSON.stringify(await fetchExchangeRate(pair.base, pair.target, pair.days), null, 2)
  )
}

export async function createPrefetchedMessages(message: string): Promise<BaseMessage[] | undefined> {
  return (
    await createWeatherToolMessages(message)
    || await createGoldToolMessages(message)
    || await createCryptoToolMessages(message)
    || await createExchangeRateToolMessages(message)
  )
}
