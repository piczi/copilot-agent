import { CryptoData } from '@/types'

const BASE_URL = 'https://api.coingecko.com/api/v3'

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

export async function fetchCrypto(coinId: string): Promise<CryptoData> {
  // Fetch current data
  const marketRes = await fetch(
    `${BASE_URL}/coins/markets?vs_currency=usd&ids=${coinId}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h`
  )
  const marketData = (await marketRes.json()) as CoinMarketItem[]

  if (!marketData || marketData.length === 0) {
    throw new Error(`未找到加密货币: ${coinId}`)
  }

  const coin = marketData[0]

  // Fetch 30-day history
  const days = 30
  const historyRes = await fetch(
    `${BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
  )
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

// Common coin ID mappings
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
  xrp: 'ripple'
}

export function resolveCoinId(name: string): string {
  const lower = name.toLowerCase().trim()
  return COIN_NAME_MAP[lower] || lower
}
