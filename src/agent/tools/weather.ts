import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { fetchWeather } from '@/services/weather'

export const weatherTool = tool(
  async ({ city }) => {
    try {
      const data = await fetchWeather(city)
      return JSON.stringify(data, null, 2)
    } catch (err) {
      return `获取天气失败: ${err instanceof Error ? err.message : String(err)}`
    }
  },
  {
    name: 'fetch_weather',
    description: '获取指定城市的当前天气和未来3天天气预报。参数 city 为中文或英文城市名，如"北京"、"Shanghai"',
    schema: z.object({
      city: z.string().describe('城市名称，如"北京"、"Shanghai"')
    })
  }
)
