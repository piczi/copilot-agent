import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { fetchCrypto, resolveCoinId } from '@/services/crypto'

export const cryptoTool = tool(
  async ({ coinId }) => {
    try {
      const resolved = resolveCoinId(coinId)
      const data = await fetchCrypto(resolved)
      return JSON.stringify(data, null, 2)
    } catch (err) {
      return `获取加密货币数据失败: ${err instanceof Error ? err.message : String(err)}`
    }
  },
  {
    name: 'fetch_crypto',
    description: '获取加密货币的行情数据。支持 bitcoin, ethereum, solana, cardano 等。可以用中文名称（如"比特币"会自动映射到 bitcoin）',
    schema: z.object({
      coinId: z.string().describe('加密货币 ID 或名称，如"bitcoin"、"以太坊"')
    })
  }
)
