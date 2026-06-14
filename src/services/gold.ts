import { GoldData } from '@/types'

const BINANCE_BASE_URL = 'https://data-api.binance.vision/api/v3'
const FETCH_TIMEOUT_MS = 10_000
const GOLD_SYMBOL = 'PAXGUSDT'

interface BinanceTicker24hr {
  lastPrice: string
  priceChangePercent: string
}

interface BinanceKline {
  0: number
  4: string
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchGold(days = 7): Promise<GoldData> {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 365) : 7

  const tickerRes = await fetchWithTimeout(`${BINANCE_BASE_URL}/ticker/24hr?symbol=${GOLD_SYMBOL}`)
  if (!tickerRes.ok) {
    throw new Error(`黄金行情请求失败 (HTTP ${tickerRes.status})`)
  }

  const ticker = (await tickerRes.json()) as BinanceTicker24hr
  if (!ticker?.lastPrice) {
    throw new Error('未返回黄金价格数据')
  }

  const klinesRes = await fetchWithTimeout(
    `${BINANCE_BASE_URL}/klines?symbol=${GOLD_SYMBOL}&interval=1d&limit=${safeDays}`
  )
  if (!klinesRes.ok) {
    throw new Error(`黄金历史数据请求失败 (HTTP ${klinesRes.status})`)
  }

  const klines = (await klinesRes.json()) as BinanceKline[]
  const history = klines.map((item) => ({
    date: new Date(item[0]).toISOString().split('T')[0],
    price: Math.round(Number(item[4]) * 100) / 100
  }))

  return {
    name: 'Gold',
    symbol: 'XAU',
    unit: 'USD/oz',
    currentPrice: Math.round(Number(ticker.lastPrice) * 100) / 100,
    priceChange24h: Math.round(Number(ticker.priceChangePercent) * 100) / 100,
    history
  }
}
