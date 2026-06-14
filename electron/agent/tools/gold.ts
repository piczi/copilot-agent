import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { fetchGold } from '@/services/gold'

export const goldTool = tool(
  async ({ days }) => {
    const safeDays = Number.isFinite(days) && days && days > 0 ? Math.min(Math.floor(days), 365) : 7
    try {
      return JSON.stringify(await fetchGold(safeDays), null, 2)
    } catch (err) {
      return JSON.stringify({
        error: `获取黄金数据失败: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  },
  {
    name: 'fetch_gold',
    description: '获取真实黄金价格数据（美元/盎司），包含当前价格、24小时涨跌幅和历史日线。用户询问黄金、金价、贵金属价格、走势、趋势或图表时必须使用，不要用 curl 或 exec_bash 自行抓取。获取数据后如需展示图表，必须继续调用 render_visual。',
    schema: z.object({
      days: z.number().optional().describe('历史天数，默认 7 天，最多 365 天')
    })
  }
)
