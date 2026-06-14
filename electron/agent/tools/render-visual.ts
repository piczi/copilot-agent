import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { VISUAL_TYPES } from '@/shared/visual-types'
import { getRuntimeContext } from '../context'
import { createVisualBlock } from '../content-router'

export const renderVisualTool = tool(
  async ({ type, data }, config) => {
    const runtime = getRuntimeContext(config)
    if (!VISUAL_TYPES.includes(type as typeof VISUAL_TYPES[number])) {
      return JSON.stringify({ error: `不支持的可视化类型：${type}` })
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return JSON.stringify({ error: '可视化数据必须是对象' })
    }

    const block = createVisualBlock(type, data as Record<string, unknown>)
    if (runtime) {
      const baseText = runtime.visibleTextRef.current.replace(/\s+$/, '')
      const separator = baseText ? '\n\n' : ''
      const nextText = `${baseText}${separator}${block}`
      runtime.visibleTextRef.current = nextText
      runtime.emit({ type: 'replace_text', chunk: nextText })
    }

    return JSON.stringify({ rendered: true })
  },
  {
    name: 'render_visual',
    description: '把已获取的真实数据渲染成前端可展示的可视化组件。图表只能通过本工具输出；禁止在回复正文中手写 ```visual 或 visual: 代码块。只能基于工具返回或用户明确提供的数据调用。调用前必须先把 fetch_gold/fetch_crypto/fetch_exchange_rate 返回的原始 history 数组映射为图表要求的格式。',
    schema: z.object({
      type: z.enum(VISUAL_TYPES as unknown as [typeof VISUAL_TYPES[number], ...typeof VISUAL_TYPES[number][]]).describe('可视化类型'),
      data: z.record(z.unknown()).describe('组件数据。line_chart/bar_chart 使用 { title, xAxis, yAxis, data: [{ name, value }], seriesName }；pie_chart 使用 { title, data: [{ name, value }] }；weather_card 使用 { city, temperature, feelsLike, condition, humidity, windSpeed, forecast }；terminal 使用 { command, platform, output, exitCode }。')
    })
  }
)
