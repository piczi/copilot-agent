import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { fetchWeather } from '@/services/weather'

export const weatherTool = tool(
  async ({ city }) => {
    const trimmedCity = city.trim()
    if (!trimmedCity) {
      return JSON.stringify({ error: '城市名称不能为空' })
    }
    try {
      return JSON.stringify(await fetchWeather(trimmedCity), null, 2)
    } catch (err) {
      return JSON.stringify({
        error: `获取天气失败: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  },
  {
    name: 'fetch_weather',
    description: '获取指定城市的真实当前天气和未来3天天气预报。用户询问天气、气温、降雨或预报时必须使用，不要凭记忆编造天气数据。',
    schema: z.object({
      city: z.string().describe('城市名称，如"北京"、"Shanghai"')
    })
  }
)
