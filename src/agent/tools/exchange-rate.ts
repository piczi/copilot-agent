import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { fetchExchangeRate } from '@/services/exchange-rate'

export const exchangeRateTool = tool(
  async ({ base, target, days }) => {
    try {
      const data = await fetchExchangeRate(base, target, days)
      return JSON.stringify(data, null, 2)
    } catch (err) {
      return `获取汇率失败: ${err instanceof Error ? err.message : String(err)}`
    }
  },
  {
    name: 'fetch_exchange_rate',
    description: '获取两种货币之间的历史汇率数据。base 和 target 均为 3 字母货币代码，如 CNY, USD, EUR, JPY, GBP',
    schema: z.object({
      base: z.string().describe('基础货币代码，如"CNY", "USD"'),
      target: z.string().describe('目标货币代码，如"CNY", "USD"'),
      days: z.number().default(30).describe('历史天数，默认30天')
    })
  }
)
