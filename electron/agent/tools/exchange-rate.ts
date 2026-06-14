import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { fetchExchangeRate } from '@/services/exchange-rate'

export const exchangeRateTool = tool(
  async ({ base, target, days }) => {
    const trimmedBase = base.trim().toUpperCase()
    const trimmedTarget = target.trim().toUpperCase()
    const safeDays = Number.isFinite(days) && days && days > 0 ? Math.min(Math.floor(days), 365) : 30

    if (!trimmedBase || !trimmedTarget) {
      return JSON.stringify({ error: '货币代码不能为空' })
    }

    try {
      return JSON.stringify(await fetchExchangeRate(trimmedBase, trimmedTarget, safeDays), null, 2)
    } catch (err) {
      return JSON.stringify({
        error: `获取汇率失败: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  },
  {
    name: 'fetch_exchange_rate',
    description: '获取两种货币之间的真实历史汇率数据。base 和 target 均为 3 字母货币代码，如 CNY, USD, EUR, JPY, GBP。用户询问汇率、走势、趋势或图表时必须使用，不要凭记忆编造汇率数据。获取数据后如需展示图表，继续调用 render_visual。',
    schema: z.object({
      base: z.string().describe('基础货币代码，如 "USD"、"CNY"'),
      target: z.string().describe('目标货币代码，如 "CNY"、"EUR"'),
      days: z.number().optional().describe('历史天数，默认 30 天')
    })
  }
)
