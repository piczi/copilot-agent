import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { MAX_OUTPUT_LENGTH } from '../constants'
import { getRuntimeContext } from '../context'
import { truncateOutput } from '../security/commandPolicy'
import {
  fetchUrlNeedsApproval,
  getFetchUrlApprovalReason,
  resolveAndValidateHost,
  validateFetchUrl
} from '../security/urlPolicy'

const FETCH_TIMEOUT_MS = 15_000

async function readResponseBody(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    return await response.text()
  }

  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
    if (result.length > MAX_OUTPUT_LENGTH) {
      result = truncateOutput(result)
      break
    }
  }
  result += decoder.decode()
  return truncateOutput(result)
}

export const fetchUrlTool = tool(
  async ({ url }, config) => {
    const validated = validateFetchUrl(url)
    if (!validated.ok) {
      return JSON.stringify({ error: validated.reason, url })
    }

    const hostCheck = await resolveAndValidateHost(validated.url.hostname)
    if (!hostCheck.ok) {
      return JSON.stringify({ error: hostCheck.reason, url: validated.url.toString() })
    }

    const runtime = getRuntimeContext(config)
    if (runtime && fetchUrlNeedsApproval(runtime.commandMode)) {
      const approved = await runtime.requestApproval(
        validated.url.toString(),
        getFetchUrlApprovalReason(validated.url.toString()),
        'url'
      )
      if (!approved) {
        return JSON.stringify({
          error: '网络请求已取消：用户未批准执行。',
          url: validated.url.toString()
        })
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    runtime?.signal.addEventListener('abort', () => controller.abort(), { once: true })

    try {
      const response = await fetch(validated.url.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'application/json, text/plain, text/html, */*',
          'User-Agent': 'copilot-agent/1.0'
        }
      })

      const body = await readResponseBody(response)
      const contentType = response.headers.get('content-type') || ''

      return JSON.stringify({
        url: response.url,
        status: response.status,
        ok: response.ok,
        contentType,
        body
      }, null, 2)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return JSON.stringify({
        error: message.includes('aborted') ? '请求超时或已取消' : `请求失败: ${message}`,
        url: validated.url.toString()
      })
    } finally {
      clearTimeout(timeout)
    }
  },
  {
    name: 'fetch_url',
    description: [
      '通过 HTTP GET 获取公开网络资源（JSON API、公开网页文本等）。',
      '用于不在 fetch_weather/fetch_exchange_rate/fetch_crypto/fetch_gold 覆盖范围内的真实外部数据查询。',
      '天气、汇率、加密货币、黄金等已接入专用数据仍必须使用对应专用工具，不要用本工具重复抓取同类数据。',
      'restricted 模式下会请求用户审批；仍应在需要真实外部数据时尝试，不要因可能需要审批而直接拒绝。',
      '失败时返回 error，可降级尝试 exec_bash 或其他只读方式，不得编造数据。'
    ].join(' '),
    schema: z.object({
      url: z.string().describe('完整 HTTP 或 HTTPS URL，如 https://api.example.com/data')
    })
  }
)
