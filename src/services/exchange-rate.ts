import { ExchangeRateData } from '@/types'

const BASE_URL = 'https://api.frankfurter.app'

export async function fetchExchangeRate(
  base: string,
  target: string,
  days: number
): Promise<ExchangeRateData> {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const url = `${BASE_URL}/${startDate}..${endDate}?from=${base}&to=${target}`
  const res = await fetch(url)
  const data = await res.json()

  if (!data.rates) {
    throw new Error('获取汇率数据失败')
  }

  const rates = Object.entries(data.rates as Record<string, Record<string, number>>)
    .map(([date, rateObj]) => ({
      date,
      rate: rateObj[target]
    }))
    .filter((r) => r.rate !== undefined)

  return {
    base: base.toUpperCase(),
    target: target.toUpperCase(),
    rates
  }
}
