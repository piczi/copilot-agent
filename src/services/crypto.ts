import { CryptoData } from '@/types'

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3'
const BINANCE_BASE_URL = 'https://data-api.binance.vision/api/v3'
const FETCH_TIMEOUT_MS = 10_000

interface CoinMarketItem {
  id: string
  symbol: string
  name: string
  current_price: number
  price_change_percentage_24h: number
  market_cap: number
}

interface MarketChart {
  prices: Array<[number, number]>
}

interface BinanceTicker24hr {
  symbol: string
  lastPrice: string
  priceChangePercent: string
}

interface BinanceKline {
  0: number
  4: string
}

const BINANCE_SYMBOL_MAP: Record<string, { symbol: string; name: string; id: string }> = {
  bitcoin: { symbol: 'BTCUSDT', name: 'Bitcoin', id: 'bitcoin' },
  btc: { symbol: 'BTCUSDT', name: 'Bitcoin', id: 'bitcoin' },
  ethereum: { symbol: 'ETHUSDT', name: 'Ethereum', id: 'ethereum' },
  eth: { symbol: 'ETHUSDT', name: 'Ethereum', id: 'ethereum' },
  solana: { symbol: 'SOLUSDT', name: 'Solana', id: 'solana' },
  sol: { symbol: 'SOLUSDT', name: 'Solana', id: 'solana' },
  cardano: { symbol: 'ADAUSDT', name: 'Cardano', id: 'cardano' },
  ada: { symbol: 'ADAUSDT', name: 'Cardano', id: 'cardano' },
  ripple: { symbol: 'XRPUSDT', name: 'XRP', id: 'ripple' },
  xrp: { symbol: 'XRPUSDT', name: 'XRP', id: 'ripple' },
  dogecoin: { symbol: 'DOGEUSDT', name: 'Dogecoin', id: 'dogecoin' },
  doge: { symbol: 'DOGEUSDT', name: 'Dogecoin', id: 'dogecoin' }
}

export const COIN_NAME_MAP: Record<string, string> = {
  bitcoin: 'bitcoin',
  btc: 'bitcoin',
  ethereum: 'ethereum',
  eth: 'ethereum',
  solana: 'solana',
  sol: 'solana',
  cardano: 'cardano',
  ada: 'cardano',
  ripple: 'ripple',
  xrp: 'ripple',
  dogecoin: 'dogecoin',
  doge: 'dogecoin'
}

export function resolveCoinId(name: string): string {
  const lower = name.toLowerCase().trim()
  return COIN_NAME_MAP[lower] || lower
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

function resolveBinanceAsset(coinId: string) {
  const normalized = resolveCoinId(coinId)
  const mapped = BINANCE_SYMBOL_MAP[normalized]
  if (mapped) return mapped

  const compact = normalized.replace(/[^a-z0-9]/gi, '')
  if (!compact) return null

  return {
    symbol: `${compact.toUpperCase()}USDT`,
    name: compact.charAt(0).toUpperCase() + compact.slice(1),
    id: normalized
  }
}

async function fetchCryptoFromCoinGecko(coinId: string): Promise<CryptoData> {
  const resolvedId = resolveCoinId(coinId)
  const marketRes = await fetchWithTimeout(
    `${COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&ids=${resolvedId}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h`
  )

  if (!marketRes.ok) {
    throw new Error(`CoinGecko 请求失败 (HTTP ${marketRes.status})`)
  }

  const marketData = (await marketRes.json()) as CoinMarketItem[]
  if (!marketData || marketData.length === 0) {
    throw new Error(`未找到加密货币: ${coinId}`)
  }

  const coin = marketData[0]
  const historyRes = await fetchWithTimeout(
    `${COINGECKO_BASE_URL}/coins/${resolvedId}/market_chart?vs_currency=usd&days=30&interval=daily`
  )

  if (!historyRes.ok) {
    throw new Error(`CoinGecko 历史数据请求失败 (HTTP ${historyRes.status})`)
  }

  const historyData = (await historyRes.json()) as MarketChart
  const history = (historyData.prices || []).map(([timestamp, price]) => ({
    date: new Date(timestamp).toISOString().split('T')[0],
    price: Math.round(price * 100) / 100
  }))

  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol.toUpperCase(),
    currentPrice: coin.current_price,
    priceChange24h: Math.round((coin.price_change_percentage_24h || 0) * 100) / 100,
    marketCap: coin.market_cap,
    history
  }
}

async function fetchCryptoFromBinance(coinId: string): Promise<CryptoData> {
  const asset = resolveBinanceAsset(coinId)
  if (!asset) {
    throw new Error(`未找到加密货币: ${coinId}`)
  }

  const tickerRes = await fetchWithTimeout(`${BINANCE_BASE_URL}/ticker/24hr?symbol=${asset.symbol}`)
  if (!tickerRes.ok) {
    throw new Error(`Binance 行情请求失败 (HTTP ${tickerRes.status})`)
  }

  const ticker = (await tickerRes.json()) as BinanceTicker24hr
  if (!ticker?.lastPrice) {
    throw new Error(`Binance 未返回 ${asset.symbol} 行情`)
  }

  const klinesRes = await fetchWithTimeout(
    `${BINANCE_BASE_URL}/klines?symbol=${asset.symbol}&interval=1d&limit=30`
  )
  if (!klinesRes.ok) {
    throw new Error(`Binance 历史数据请求失败 (HTTP ${klinesRes.status})`)
  }

  const klines = (await klinesRes.json()) as BinanceKline[]
  const history = klines.map((item) => ({
    date: new Date(item[0]).toISOString().split('T')[0],
    price: Math.round(Number(item[4]) * 100) / 100
  }))

  return {
    id: asset.id,
    name: asset.name,
    symbol: asset.symbol.replace(/USDT$/, ''),
    currentPrice: Math.round(Number(ticker.lastPrice) * 100) / 100,
    priceChange24h: Math.round(Number(ticker.priceChangePercent) * 100) / 100,
    marketCap: 0,
    history
  }
}

export async function fetchCrypto(coinId: string): Promise<CryptoData> {
  const errors: string[] = []

  try {
    return await fetchCryptoFromCoinGecko(coinId)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  try {
    return await fetchCryptoFromBinance(coinId)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  throw new Error(`获取加密货币数据失败: ${errors.join('；')}`)
}
