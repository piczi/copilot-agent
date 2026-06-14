import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { fetchCrypto, resolveCoinId } from '@/services/crypto'

export const cryptoTool = tool(
  async ({ coinId }) => {
    const trimmedCoinId = coinId.trim()
    if (!trimmedCoinId) {
      return JSON.stringify({ error: '加密货币 ID 不能为空' })
    }
    try {
      return JSON.stringify(await fetchCrypto(resolveCoinId(trimmedCoinId)), null, 2)
    } catch (err) {
      return JSON.stringify({
        error: `获取加密货币数据失败: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  },
  {
    name: 'fetch_crypto',
    description: '获取真实加密货币行情数据，包含当前价格、24小时涨跌幅、市值和近30天历史价格。用户询问加密货币价格、行情、走势、趋势或图表时必须使用，不要凭记忆编造价格序列。获取数据后如需展示图表，继续调用 render_visual。',
    schema: z.object({
      coinId: z.string().describe('加密货币 ID 或名称，如"bitcoin"、"ethereum"、"比特币"')
    })
  }
)
