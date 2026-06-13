import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import StoreModule from 'electron-store'
import { SYSTEM_PROMPT } from '@/agent/prompts/system'
import { fetchCrypto, resolveCoinId } from '@/services/crypto'
import { fetchExchangeRate } from '@/services/exchange-rate'
import { fetchWeather } from '@/services/weather'
const Store = (StoreModule as any).default || StoreModule

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const RENDERER_URL = process.env['ELECTRON_RENDERER_URL'] || process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'renderer')

process.env.VITE_PUBLIC = RENDERER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const store = new Store()
const LLM_CONFIG_KEY = 'llm-config'
const MAX_COMMAND_LENGTH = 2000
const MAX_TOOL_TURNS = 10
const MAX_OUTPUT_LENGTH = 100_000
const APPROVAL_TTL_MS = 60_000

type CommandMode = 'restricted' | 'dangerous'

interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom'
  apiKey: string
  baseURL?: string
  model: string
  proxy?: string
  hasApiKey?: boolean
}

interface ExecCommandOptions {
  cwd?: string
  mode?: CommandMode
  approvalToken?: string
  history?: ChatHistoryMessage[]
}

interface ApprovalRecord {
  command: string
  cwd: string
  expiresAt: number
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'deepseek',
  apiKey: '',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
}

const approvalTokens = new Map<string, ApprovalRecord>()
const activeChatStreams = new Map<string, () => void>()

interface ChatStreamPayload {
  type: 'thinking' | 'thinking_done' | 'text' | 'replace_text' | 'approval_required' | 'done' | 'error'
  chunk?: string
  error?: string
  approvalId?: string
  command?: string
  reason?: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  reasoning_content?: string
  tool_calls?: ToolCallRequest[]
  tool_call_id?: string
}

interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ToolCallRequest {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface ChatCompletionTurnResult {
  toolCalls: ToolCallRequest[]
  reasoning: string
}

function isProvider(value: unknown): value is LLMConfig['provider'] {
  return value === 'openai' || value === 'anthropic' || value === 'deepseek' || value === 'ollama' || value === 'custom'
}

function cleanConfig(config: Partial<LLMConfig>, existing?: LLMConfig): LLMConfig {
  const provider = isProvider(config.provider) ? config.provider : existing?.provider || DEFAULT_CONFIG.provider
  const apiKey = typeof config.apiKey === 'string' && config.apiKey.trim()
    ? config.apiKey.trim()
    : existing?.apiKey || ''
  const baseURL = typeof config.baseURL === 'string'
    ? config.baseURL.trim()
    : existing?.baseURL || DEFAULT_CONFIG.baseURL
  const model = typeof config.model === 'string' && config.model.trim()
    ? config.model.trim()
    : existing?.model || DEFAULT_CONFIG.model

  return {
    provider,
    apiKey,
    baseURL,
    model,
    proxy: typeof config.proxy === 'string' ? config.proxy.trim() : existing?.proxy
  }
}

function getStoredLLMConfig(): LLMConfig {
  const stored = store.get(LLM_CONFIG_KEY)
  if (stored && typeof stored === 'object') {
    return cleanConfig(stored as Partial<LLMConfig>, DEFAULT_CONFIG)
  }
  return cleanConfig(DEFAULT_CONFIG)
}

function redactConfig(config: LLMConfig): LLMConfig {
  return {
    ...config,
    apiKey: '',
    hasApiKey: Boolean(config.apiKey)
  }
}

function normalizeBaseURL(baseURL: string | undefined): string {
  return (baseURL || '').replace(/\/+$/, '')
}

function isSafeReadOnlyCommand(command: string): boolean {
  const normalized = command.trim()
  const safePatterns = [
    /^(pwd|dir|ls|whoami|hostname|uname|lscpu|free|df|sw_vers)(\s+[-\w./\\:=@{}'"^~]*)?$/i,
    /^sysctl\s+[-\w.]+(\s+[-\w.]+)*$/i,
    /^system_profiler\s+[-\w\s]+(\|\s*sed\s+-n\s+['"]?\d+,\d+p['"]?)?$/i,
    /^git\s+(status|log|branch|show|diff)(\s+[-\w./\\:=@{}'"^~]+)*$/i,
    /^Get-CimInstance\s+[\w.]+(\s*\|\s*Select-Object\s+[-\w\s,*]+)?$/i,
    /^Get-ComputerInfo(\s*\|\s*Select-Object\s+[-\w\s,*]+)?$/i,
    /^Get-ChildItem(\s+[-\w./\\:'",=(){}$]+)*$/i,
    /^Get-Content(\s+[-\w./\\:'",=(){}$]+)*$/i,
    /^Get-Location$/i,
    /^(Get-Location|Get-ChildItem|Get-Content|Get-ComputerInfo|Get-CimInstance|Select-Object|ConvertTo-Json)(\s+[-\w./\\:'",=()|{}$]*)?$/i,
    /^echo\s+[\w\s.,:;'"()[\]{}@/#\\-]*$/i
  ]
  return safePatterns.some((pattern) => pattern.test(normalized))
}

function commandNeedsApproval(command: string): boolean {
  const normalized = command.toLowerCase()
  const riskyPattern = /[;&><`\n\r]|\b(rm|del|erase|remove-item|rmdir|rd|move|mv|copy|cp|set-content|add-content|new-item|mkdir|touch|format|shutdown|restart-computer|curl|wget|invoke-webrequest|irm|npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install|git\s+clean|git\s+reset|git\s+checkout)\b/
  return riskyPattern.test(normalized)
}

function restrictedCommandNeedsApproval(command: string): boolean {
  return commandNeedsApproval(command) || !isSafeReadOnlyCommand(command)
}

function getCommandApprovalReason(command: string): string {
  return commandNeedsApproval(command)
    ? '该命令包含高风险、写入、网络请求或组合命令语义，需要用户审批'
    : '该命令不在受限模式安全白名单中，需要用户审批'
}

function resolveCommandCwd(cwd?: string): { ok: true; cwd: string } | { ok: false; reason: string } {
  const appRoot = process.env.APP_ROOT || process.cwd()
  const requested = path.resolve(cwd || process.cwd())
  const allowedRoots = [path.resolve(process.cwd()), path.resolve(appRoot)]
  const isAllowed = allowedRoots.some((root) => requested === root || requested.startsWith(root + path.sep))

  if (!isAllowed) {
    return { ok: false, reason: '命令工作目录不在允许范围内' }
  }
  return { ok: true, cwd: requested }
}

function consumeApprovalToken(token: string | undefined, command: string, cwd: string): boolean {
  if (!token) return false
  const record = approvalTokens.get(token)
  approvalTokens.delete(token)
  return Boolean(record && record.command === command && record.cwd === cwd && record.expiresAt > Date.now())
}

function createApprovalToken(command: string, cwd: string): string {
  const token = randomUUID()
  approvalTokens.set(token, {
    command,
    cwd,
    expiresAt: Date.now() + APPROVAL_TTL_MS
  })
  return token
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output
  return output.slice(0, MAX_OUTPUT_LENGTH) + '\n\n[输出已截断]'
}

function getPlatformName(): string {
  if (process.platform === 'win32') return 'Windows'
  if (process.platform === 'darwin') return 'macOS'
  return 'Linux'
}

function getRuntimePlatformInstruction(): string {
  if (process.platform === 'win32') {
    return [
      '当前运行平台：Windows (process.platform=win32)。',
      '需要执行或建议系统命令时，必须使用 Windows PowerShell 语法，例如 Get-ChildItem、Get-Content、Select-String、Get-Location。',
      '如果需要读取本机信息，必须调用 exec_bash 工具生成并执行只读 PowerShell 命令。',
      '不要使用 uname、sysctl、system_profiler、ls -la 等 macOS/Linux 专属写法来判断本机信息。'
    ].join('\n')
  }

  if (process.platform === 'darwin') {
    return [
      '当前运行平台：macOS (process.platform=darwin)。',
      '需要执行或建议系统命令时，必须使用 macOS/POSIX Shell 语法，例如 uname、sysctl、system_profiler、ls、cat、grep、pwd。',
      '如果需要读取本机信息，必须调用 exec_bash 工具生成并执行只读 macOS/POSIX 命令。',
      '不要使用 Get-CimInstance、Get-ComputerInfo、PowerShell 管道对象等 Windows 专属写法来判断本机信息。'
    ].join('\n')
  }

  return [
    `当前运行平台：Linux (process.platform=${process.platform})。`,
    '需要执行或建议系统命令时，必须使用 Linux/POSIX Shell 语法，例如 uname、lscpu、free、df、ls、cat、grep、pwd。',
    '如果需要读取本机信息，必须调用 exec_bash 工具生成并执行只读 Linux/POSIX 命令。',
    '不要使用 Get-CimInstance、system_profiler 等其他平台专属写法来判断本机信息。'
  ].join('\n')
}

function isWeatherQuery(message: string): boolean {
  return /\bweather\b|\bforecast\b|天气|气温|温度|下雨|降雨|预报/i.test(message)
}

function cleanWeatherCityCandidate(value: string): string {
  return value
    .replace(/\b(in|for|at|of)\b/gi, ' ')
    .replace(/今天|明天|后天|大后天|现在|当前|最近|未来\d*天?|请问|帮我|查询|查一下|看看|一下|的|怎么样|如何/g, '')
    .replace(/[？?。！!,，：:\s]+/g, ' ')
    .trim()
}

function extractWeatherCity(message: string): string {
  const keywordMatch = /天气|气温|温度|下雨|降雨|预报|\bweather\b|\bforecast\b/i.exec(message)
  if (!keywordMatch) return ''

  const before = cleanWeatherCityCandidate(message.slice(0, keywordMatch.index))
  if (before) return before

  return cleanWeatherCityCandidate(message.slice(keywordMatch.index + keywordMatch[0].length))
}

function runLocalCommand(
  command: string,
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const commandText = isWin
      ? `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`
      : command
    const child = spawn(isWin ? 'powershell.exe' : '/bin/sh', isWin
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandText]
      : ['-c', commandText], {
      cwd: process.cwd(),
      env: process.env
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const settle = (result: { stdout: string; stderr: string; exitCode: number | null }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve(result)
    }

    const abort = () => {
      child.kill()
      settle({ stdout, stderr: stderr || '已取消', exitCode: -1 })
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (data) => { stdout = truncateOutput(stdout + data) })
    child.stderr.on('data', (data) => { stderr = truncateOutput(stderr + data) })

    const timer = setTimeout(() => {
      child.kill()
      settle({ stdout, stderr: stderr || '命令执行超时（30秒）', exitCode: -1 })
    }, 30000)

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
      return
    }

    child.on('close', (code) => {
      settle({ stdout, stderr, exitCode: code })
    })

    child.on('error', (err) => {
      settle({ stdout, stderr: err.message, exitCode: -1 })
    })
  })
}

function sendChatStreamEvent(sender: Electron.WebContents, requestId: string, payload: ChatStreamPayload): void {
  if (!sender.isDestroyed()) {
    sender.send(`chat-completion-stream:${requestId}`, payload)
  }
}

function requestCommandApproval(
  sender: Electron.WebContents,
  requestId: string,
  command: string,
  reason: string,
  signal: AbortSignal
): Promise<boolean> {
  return new Promise((resolve) => {
    const approvalId = randomUUID()
    const responseChannel = `chat-command-approval-response:${requestId}:${approvalId}`
    const timeout = setTimeout(() => {
      cleanup()
      resolve(false)
    }, APPROVAL_TTL_MS)

    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      ipcMain.removeAllListeners(responseChannel)
    }

    const abort = () => {
      cleanup()
      resolve(false)
    }

    ipcMain.once(responseChannel, (_event, approved: boolean) => {
      cleanup()
      resolve(Boolean(approved))
    })

    signal.addEventListener('abort', abort, { once: true })
    sendChatStreamEvent(sender, requestId, {
      type: 'approval_required',
      approvalId,
      command,
      reason
    })
  })
}

function extractStreamDelta(line: string): {
  content?: string
  reasoning?: string
  toolCalls?: Array<{
    index: number
    id?: string
    name?: string
    arguments?: string
  }>
  finishReason?: string
  done?: boolean
} | null {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (!data) return null
  if (data === '[DONE]') return { done: true }

  try {
    const parsed = JSON.parse(data)
    const choice = parsed.choices?.[0] || {}
    const delta = choice.delta || {}
    return {
      content: delta.content || '',
      reasoning: delta.reasoning_content || delta.reasoning || '',
      finishReason: choice.finish_reason || '',
      toolCalls: Array.isArray(delta.tool_calls)
        ? delta.tool_calls.map((toolCall: any) => ({
          index: toolCall.index,
          id: toolCall.id,
          name: toolCall.function?.name,
          arguments: toolCall.function?.arguments
        }))
        : undefined
    }
  } catch {
    return null
  }
}

function createContentRouter(emit: (payload: ChatStreamPayload) => void): {
  push: (chunk: string) => void
  flush: () => void
} {
  const thinkingStart = '<thinking>'
  const thinkingEnd = '</thinking>'
  let mode: 'unknown' | 'thinking' | 'text' = 'unknown'
  let buffer = ''
  let thinkingOpen = false

  const finishThinking = () => {
    if (thinkingOpen) {
      thinkingOpen = false
      emit({ type: 'thinking_done' })
    }
  }

  const route = () => {
    while (buffer) {
      if (mode === 'unknown') {
        if (buffer.startsWith(thinkingStart)) {
          buffer = buffer.slice(thinkingStart.length)
          mode = 'thinking'
          thinkingOpen = true
          continue
        }
        if (thinkingStart.startsWith(buffer)) return
        mode = 'text'
        continue
      }

      if (mode === 'thinking') {
        const endIdx = buffer.indexOf(thinkingEnd)
        if (endIdx !== -1) {
          const thinkingChunk = buffer.slice(0, endIdx)
          if (thinkingChunk) emit({ type: 'thinking', chunk: thinkingChunk })
          buffer = buffer.slice(endIdx + thinkingEnd.length).replace(/^\s+/, '')
          mode = 'text'
          finishThinking()
          continue
        }

        const safeLength = Math.max(0, buffer.length - thinkingEnd.length)
        if (safeLength > 0) {
          emit({ type: 'thinking', chunk: buffer.slice(0, safeLength) })
          buffer = buffer.slice(safeLength)
        }
        return
      }

      emit({ type: 'text', chunk: buffer })
      buffer = ''
    }
  }

  return {
    push: (chunk) => {
      buffer += chunk
      route()
    },
    flush: () => {
      if (mode === 'thinking' && buffer) {
        emit({ type: 'thinking', chunk: buffer })
        buffer = ''
        finishThinking()
        return
      }
      if (buffer) {
        emit({ type: 'text', chunk: buffer })
        buffer = ''
      }
    }
  }
}

function createTerminalBlock(command: string, platform: string, output: string, exitCode: number | null): string {
  return `\`\`\`visual:terminal\n${JSON.stringify({
    command,
    platform,
    output,
    exitCode
  }, null, 2)}\n\`\`\``
}

function createVisualBlock(type: string, data: Record<string, unknown>): string {
  return `\`\`\`visual:${type}\n${JSON.stringify(data, null, 2)}\n\`\`\``
}

const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fetch_weather',
      description: '获取指定城市的真实当前天气和未来3天天气预报。用户询问天气、气温、降雨或预报时必须使用，不要凭记忆编造天气数据。',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称，如"北京"、"Shanghai"'
          }
        },
        required: ['city']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_crypto',
      description: '获取真实加密货币行情数据，包含当前价格、24小时涨跌幅、市值和近30天历史价格。用户询问加密货币价格、行情、走势、趋势或图表时必须使用，不要凭记忆编造价格序列。获取数据后如需展示图表，继续调用 render_visual。',
      parameters: {
        type: 'object',
        properties: {
          coinId: {
            type: 'string',
            description: '加密货币 ID 或名称，如"bitcoin"、"ethereum"、"比特币"'
          }
        },
        required: ['coinId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_exchange_rate',
      description: '获取两种货币之间的真实历史汇率数据。base 和 target 均为 3 字母货币代码，如 CNY, USD, EUR, JPY, GBP。用户询问汇率、走势、趋势或图表时必须使用，不要凭记忆编造汇率数据。获取数据后如需展示图表，继续调用 render_visual。',
      parameters: {
        type: 'object',
        properties: {
          base: {
            type: 'string',
            description: '基础货币代码，如 "USD"、"CNY"'
          },
          target: {
            type: 'string',
            description: '目标货币代码，如 "CNY"、"EUR"'
          },
          days: {
            type: 'number',
            description: '历史天数，默认 30 天'
          }
        },
        required: ['base', 'target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'render_visual',
      description: '把已获取的真实数据渲染成前端可展示的可视化组件。只能基于工具返回或用户明确提供的数据调用；不要直接在回复正文中手写 XML、HTML、JSX 或组件标签。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['weather_card', 'line_chart', 'bar_chart', 'pie_chart', 'terminal'],
            description: '可视化类型：weather_card 天气卡片；line_chart 折线图；bar_chart 柱状图；pie_chart 饼图；terminal 终端输出。'
          },
          data: {
            type: 'object',
            description: '组件数据。line_chart/bar_chart 使用 { title, xAxis, yAxis, data: [{ name, value }], seriesName }；pie_chart 使用 { title, data: [{ name, value }] }；weather_card 使用 { city, temperature, feelsLike, condition, humidity, windSpeed, forecast }；terminal 使用 { command, platform, output, exitCode }。'
          }
        },
        required: ['type', 'data']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'exec_bash',
      description: '真实执行当前电脑上的系统命令。Windows 使用 PowerShell，macOS/Linux 使用 /bin/sh -c。受限模式下高风险、写入、网络请求或组合命令会请求用户审批；危险模式下用户已允许直接执行。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要真实执行的命令。必须符合当前运行平台语法。'
          }
        },
        required: ['command']
      }
    }
  }
]

async function executeFetchWeatherTool(city: string): Promise<string> {
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
}

async function executeFetchCryptoTool(coinId: string): Promise<string> {
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
}

async function executeFetchExchangeRateTool(base: string, target: string, days?: number): Promise<string> {
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
}

function executeRenderVisualTool(type: string, data: unknown): { ok: boolean; block?: string; error?: string } {
  const allowedTypes = new Set(['weather_card', 'line_chart', 'bar_chart', 'pie_chart', 'terminal'])
  if (!allowedTypes.has(type)) {
    return { ok: false, error: `不支持的可视化类型：${type}` }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: '可视化数据必须是对象' }
  }

  return {
    ok: true,
    block: createVisualBlock(type, data as Record<string, unknown>)
  }
}

async function createWeatherToolMessages(message: string): Promise<ChatMessage[] | undefined> {
  if (!isWeatherQuery(message)) return undefined

  const city = extractWeatherCity(message)
  if (!city) return undefined

  const toolCallId = `fetch_weather_${randomUUID()}`
  return [
    { role: 'user', content: message },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: toolCallId,
          type: 'function',
          function: {
            name: 'fetch_weather',
            arguments: JSON.stringify({ city })
          }
        }
      ],
      reasoning_content: `需要获取 "${city}" 的真实天气数据。`
    },
    {
      role: 'tool',
      tool_call_id: toolCallId,
      content: await executeFetchWeatherTool(city)
    }
  ]
}

function sanitizeHistoryMessages(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []

  return history
    .map((item): ChatMessage | null => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      if (raw.role !== 'user' && raw.role !== 'assistant') return null
      const content = typeof raw.content === 'string' ? raw.content.trim() : ''
      if (!content) return null

      return {
        role: raw.role,
        content
      }
    })
    .filter((message): message is ChatMessage => Boolean(message))
}

async function createInitialMessages(message: string, history: ChatHistoryMessage[] = []): Promise<ChatMessage[]> {
  const weatherToolMessages = await createWeatherToolMessages(message)
  const historyMessages = sanitizeHistoryMessages(history)
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: getRuntimePlatformInstruction() },
    ...historyMessages,
    ...(weatherToolMessages || [{ role: 'user' as const, content: message }])
  ]
}

async function executeExecBashTool(
  command: string,
  mode: CommandMode,
  sender: Electron.WebContents,
  requestId: string,
  signal: AbortSignal
): Promise<{
  platform: string
  command: string
  output: string
  exitCode: number | null
}> {
  const trimmedCommand = command.trim()
  if (!trimmedCommand) {
    return {
      platform: getPlatformName(),
      command,
      output: '命令不能为空',
      exitCode: -1
    }
  }

  if (trimmedCommand.length > MAX_COMMAND_LENGTH) {
    return {
      platform: getPlatformName(),
      command: trimmedCommand,
      output: '命令过长',
      exitCode: -1
    }
  }

  if (mode === 'restricted' && restrictedCommandNeedsApproval(trimmedCommand)) {
    const reason = getCommandApprovalReason(trimmedCommand)
    const approved = await requestCommandApproval(sender, requestId, trimmedCommand, reason, signal)
    if (!approved) {
      return {
        platform: getPlatformName(),
        command: trimmedCommand,
        output: '命令已取消：用户未批准执行。',
        exitCode: -1
      }
    }
  }

  const result = await runLocalCommand(trimmedCommand, signal)
  return {
    platform: getPlatformName(),
    command: trimmedCommand,
    output: result.stdout || result.stderr || '(无输出)',
    exitCode: result.exitCode
  }
}

async function streamChatCompletionTurn(
  config: LLMConfig,
  messages: ChatMessage[],
  emit: (payload: ChatStreamPayload) => void,
  contentRouter: ReturnType<typeof createContentRouter>,
  signal: AbortSignal,
  enableTools = true
): Promise<ChatCompletionTurnResult> {
  let reasoningStarted = false
  let reasoning = ''
  const toolCallParts = new Map<number, ToolCallRequest>()

  const res = await fetch(`${normalizeBaseURL(config.baseURL)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      ...(enableTools ? { tools: CHAT_TOOLS, tool_choice: 'auto' } : {}),
      temperature: 0.7,
      stream: true
    }),
    signal
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  if (!res.body) {
    throw new Error('API 响应格式异常，未返回可读流')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() || ''

    for (const frame of frames) {
      const lines = frame.split(/\r?\n/)
      for (const line of lines) {
        const delta = extractStreamDelta(line)
        if (!delta) continue
        if (delta.done) {
          if (reasoningStarted) emit({ type: 'thinking_done' })
          contentRouter.flush()
          return {
            reasoning,
            toolCalls: [...toolCallParts.entries()]
              .sort(([a], [b]) => a - b)
              .map(([, toolCall]) => toolCall)
          }
        }
        if (delta.reasoning) {
          reasoningStarted = true
          reasoning += delta.reasoning
          emit({ type: 'thinking', chunk: delta.reasoning })
        }
        if (delta.content) {
          if (reasoningStarted) {
            reasoningStarted = false
            emit({ type: 'thinking_done' })
          }
          contentRouter.push(delta.content)
        }
        for (const part of delta.toolCalls || []) {
          const existing = toolCallParts.get(part.index) || {
            id: part.id || `tool_${part.index}`,
            type: 'function' as const,
            function: { name: part.name || '', arguments: '' }
          }
          if (part.id) existing.id = part.id
          if (part.name) existing.function.name = part.name
          if (part.arguments) existing.function.arguments += part.arguments
          toolCallParts.set(part.index, existing)
        }
      }
    }
  }

  if (reasoningStarted) emit({ type: 'thinking_done' })
  contentRouter.flush()
  return {
    reasoning,
    toolCalls: [...toolCallParts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, toolCall]) => toolCall)
  }
}

async function streamNativeChat(
  config: LLMConfig,
  message: string,
  mode: CommandMode,
  history: ChatHistoryMessage[],
  sender: Electron.WebContents,
  requestId: string,
  signal: AbortSignal
): Promise<void> {
  if (!config.apiKey) {
    throw new Error('请先配置 LLM API Key（点击左上角设置图标）')
  }
  if (!config.baseURL) {
    throw new Error('请先配置 Base URL')
  }

  const emit = (payload: ChatStreamPayload) => sendChatStreamEvent(sender, requestId, payload)
  let visibleText = ''
  const routedEmit = (payload: ChatStreamPayload) => {
    if (payload.type === 'text' && payload.chunk) {
      visibleText += payload.chunk
    }
    if (payload.type === 'replace_text' && payload.chunk !== undefined) {
      visibleText = payload.chunk
    }
    emit(payload)
  }
  const contentRouter = createContentRouter(routedEmit)
  const messages = await createInitialMessages(message, history)

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    let turnResult: ChatCompletionTurnResult
    try {
      turnResult = await streamChatCompletionTurn(config, messages, routedEmit, contentRouter, signal)
    } catch (err) {
      messages.push({
        role: 'system',
        content: [
          '上一轮模型或工具调用失败。不要把原始错误直接展示给用户。',
          `错误摘要：${err instanceof Error ? err.message : String(err)}`,
          '请基于已有上下文继续给出有帮助的回答；如果缺少必要数据，请用自然语言说明暂时无法完成。'
        ].join('\n')
      })
      try {
        turnResult = await streamChatCompletionTurn(config, messages, routedEmit, contentRouter, signal, false)
      } catch {
        routedEmit({ type: 'text', chunk: '请求暂时失败，我已经尝试恢复但仍无法完成这次回答。' })
        emit({ type: 'done' })
        return
      }
    }

    const { toolCalls, reasoning } = turnResult
    if (signal.aborted) return
    if (toolCalls.length === 0) {
      emit({ type: 'done' })
      return
    }

    messages.push({
      role: 'assistant',
      content: null,
      reasoning_content: reasoning || undefined,
      tool_calls: toolCalls
    })

    for (const toolCall of toolCalls) {
      if (toolCall.function.name === 'fetch_weather') {
        let city = ''
        try {
          city = JSON.parse(toolCall.function.arguments || '{}').city || ''
        } catch {
          city = ''
        }

        const result = await executeFetchWeatherTool(city)
        if (signal.aborted) return
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        })
        continue
      }

      if (toolCall.function.name === 'fetch_crypto') {
        let coinId = ''
        try {
          coinId = JSON.parse(toolCall.function.arguments || '{}').coinId || ''
        } catch {
          coinId = ''
        }

        const result = await executeFetchCryptoTool(coinId)
        if (signal.aborted) return
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        })
        continue
      }

      if (toolCall.function.name === 'fetch_exchange_rate') {
        let base = ''
        let target = ''
        let days: number | undefined
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          base = args.base || ''
          target = args.target || ''
          days = Number(args.days)
        } catch {
          base = ''
          target = ''
        }

        const result = await executeFetchExchangeRateTool(base, target, days)
        if (signal.aborted) return
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        })
        continue
      }

      if (toolCall.function.name === 'render_visual') {
        let type = ''
        let data: unknown
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          type = args.type || ''
          data = args.data
        } catch {
          type = ''
        }

        const result = executeRenderVisualTool(type, data)
        if (signal.aborted) return
        if (result.ok && result.block) {
          const baseText = visibleText.replace(/\s+$/, '')
          const separator = baseText ? '\n\n' : ''
          routedEmit({ type: 'replace_text', chunk: `${baseText}${separator}${result.block}` })
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result.ok ? { rendered: true } : { error: result.error })
        })
        continue
      }

      if (toolCall.function.name !== 'exec_bash') {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `未知工具：${toolCall.function.name}` })
        })
        continue
      }

      let command = ''
      try {
        command = JSON.parse(toolCall.function.arguments || '{}').command || ''
      } catch {
        command = ''
      }

      const baseText = visibleText.replace(/\s+$/, '')
      const separator = baseText ? '\n\n' : ''
      const pendingText = `${baseText}${separator}${createTerminalBlock(command, getPlatformName(), '命令由大模型生成，正在真实执行...', null)}`
      routedEmit({ type: 'replace_text', chunk: pendingText })

      const result = await executeExecBashTool(command, mode, sender, requestId, signal)
      if (signal.aborted) return

      const finalText = `${baseText}${separator}${createTerminalBlock(result.command, result.platform, result.output, result.exitCode)}`
      routedEmit({ type: 'replace_text', chunk: finalText })
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      })
    }
  }

  routedEmit({ type: 'text', chunk: '\n\n工具调用轮次过多，已停止继续执行。' })
  emit({ type: 'done' })
}

ipcMain.handle('get-store-value', (_event, key: string) => {
  return store.get(key)
})

ipcMain.handle('set-store-value', (_event, key: string, value: unknown) => {
  store.set(key, value)
})

ipcMain.handle('get-llm-config', () => {
  return redactConfig(getStoredLLMConfig())
})

ipcMain.handle('save-llm-config', (_event, config: Partial<LLMConfig>) => {
  const existing = getStoredLLMConfig()
  store.set(LLM_CONFIG_KEY, cleanConfig(config, existing))
})

async function nativeChat(config: LLMConfig, message: string, history: ChatHistoryMessage[] = []): Promise<string> {
  if (!config.apiKey) {
    throw new Error('请先配置 LLM API Key（点击左上角设置图标）')
  }
  if (!config.baseURL) {
    throw new Error('请先配置 Base URL')
  }

  const messages = await createInitialMessages(message, history)

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await fetch(`${normalizeBaseURL(config.baseURL)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        tools: CHAT_TOOLS,
        tool_choice: 'auto',
        temperature: 0.7
      })
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
    }

    const data = await res.json()
    const msg = data.choices?.[0]?.message
    const content = msg?.content || ''
    const reasoning = msg?.reasoning_content || ''
    const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls as ToolCallRequest[] : []

    if (toolCalls.length === 0) {
      if (!content && !reasoning) {
        throw new Error('API 响应格式异常，未找到 content 或 reasoning_content 字段')
      }
      return reasoning ? `<thinking>${reasoning}</thinking>\n\n${content}` : content
    }

    messages.push({
      role: 'assistant',
      content: content || null,
      reasoning_content: reasoning || undefined,
      tool_calls: toolCalls
    })

    for (const toolCall of toolCalls) {
      if (toolCall.function.name === 'fetch_weather') {
        let city = ''
        try {
          city = JSON.parse(toolCall.function.arguments || '{}').city || ''
        } catch {
          city = ''
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: await executeFetchWeatherTool(city)
        })
        continue
      }

      if (toolCall.function.name === 'fetch_crypto') {
        let coinId = ''
        try {
          coinId = JSON.parse(toolCall.function.arguments || '{}').coinId || ''
        } catch {
          coinId = ''
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: await executeFetchCryptoTool(coinId)
        })
        continue
      }

      if (toolCall.function.name === 'fetch_exchange_rate') {
        let base = ''
        let target = ''
        let days: number | undefined
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          base = args.base || ''
          target = args.target || ''
          days = Number(args.days)
        } catch {
          base = ''
          target = ''
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: await executeFetchExchangeRateTool(base, target, days)
        })
        continue
      }

      if (toolCall.function.name === 'render_visual') {
        let type = ''
        let data: unknown
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}')
          type = args.type || ''
          data = args.data
        } catch {
          type = ''
        }

        const result = executeRenderVisualTool(type, data)
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.ok && result.block ? result.block : JSON.stringify({ error: result.error })
        })
        continue
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: `非流式模式暂不支持工具：${toolCall.function.name}` })
      })
    }
  }

  throw new Error('工具调用轮次过多，已停止继续执行。')
}

ipcMain.handle('test-llm-config', async (_event, config: Partial<LLMConfig>) => {
  const normalized = cleanConfig(config, getStoredLLMConfig())
  if (!normalized.apiKey) {
    return { ok: false, message: '请先填写 API Key' }
  }
  if (!normalized.baseURL) {
    return { ok: false, message: '请先填写 Base URL' }
  }

  try {
    const res = await fetch(`${normalizeBaseURL(normalized.baseURL)}/models`, {
      headers: { Authorization: `Bearer ${normalized.apiKey}` }
    })
    const body = await res.text().catch(() => '')
    if (res.ok) {
      return { ok: true, message: `连接成功！Base URL: ${normalized.baseURL}, Model: ${normalized.model}` }
    }
    if (res.status === 401) {
      return { ok: false, message: 'API Key 无效 (401)。请检查 Key 是否完整、是否属于该服务商。' }
    }
    return { ok: false, message: `连接失败 (HTTP ${res.status}): ${body.slice(0, 200)}` }
  } catch (e) {
    return { ok: false, message: `网络错误: ${e instanceof Error ? e.message : String(e)}` }
  }
})

ipcMain.handle('chat-completion', async (_event, message: string, options: ExecCommandOptions = {}) => {
  return nativeChat(getStoredLLMConfig(), message, options.history || [])
})

ipcMain.on('chat-completion-stream', async (event, requestId: string, message: string, options: ExecCommandOptions = {}) => {
  const controller = new AbortController()
  activeChatStreams.set(requestId, () => controller.abort())
  const mode: CommandMode = options.mode === 'dangerous' ? 'dangerous' : 'restricted'
  const history = Array.isArray(options.history) ? options.history : []

  try {
    await streamNativeChat(getStoredLLMConfig(), message, mode, history, event.sender, requestId, controller.signal)
  } catch (e) {
    if (!controller.signal.aborted) {
      sendChatStreamEvent(event.sender, requestId, {
        type: 'error',
        error: e instanceof Error ? e.message : String(e)
      })
    }
  } finally {
    activeChatStreams.delete(requestId)
  }
})

ipcMain.on('chat-completion-stream-cancel', (_event, requestId: string) => {
  activeChatStreams.get(requestId)?.()
  activeChatStreams.delete(requestId)
})

ipcMain.handle('exec-command', async (_event, command: string, options: ExecCommandOptions = {}) => {
  return new Promise((resolve) => {
    const mode: CommandMode = options.mode === 'dangerous' ? 'dangerous' : 'restricted'
    const trimmedCommand = typeof command === 'string' ? command.trim() : ''
    const cwdResult = resolveCommandCwd(options.cwd)

    if (!trimmedCommand) {
      resolve({ stdout: '', stderr: '命令不能为空', exitCode: -1, platform: process.platform })
      return
    }
    if (trimmedCommand.length > MAX_COMMAND_LENGTH) {
      resolve({ stdout: '', stderr: '命令过长', exitCode: -1, platform: process.platform })
      return
    }
    if (!cwdResult.ok) {
      resolve({ stdout: '', stderr: cwdResult.reason, exitCode: -1, platform: process.platform })
      return
    }

    if (mode === 'restricted' && restrictedCommandNeedsApproval(trimmedCommand)) {
      const tokenApproved = consumeApprovalToken(options.approvalToken, trimmedCommand, cwdResult.cwd)
      if (!tokenApproved) {
        resolve({
          stdout: '',
          stderr: '',
          exitCode: null,
          platform: process.platform,
          approvalRequired: true,
          approvalToken: createApprovalToken(trimmedCommand, cwdResult.cwd),
          reason: getCommandApprovalReason(trimmedCommand)
        })
        return
      }
    }

    const isWin = process.platform === 'win32'
    let shell: string
    let args: string[]

    if (isWin) {
      // Windows: 优先 PowerShell 7+ (pwsh)，回退 PowerShell 5.1
      shell = 'powershell.exe'
      args = ['-NoProfile', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${trimmedCommand}`]
    } else {
      // macOS / Linux: 使用 /bin/sh
      shell = '/bin/sh'
      args = ['-c', trimmedCommand]
    }

    const child = spawn(shell, args, {
      cwd: cwdResult.cwd,
      env: process.env
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (data) => { stdout = truncateOutput(stdout + data) })
    child.stderr.on('data', (data) => { stderr = truncateOutput(stderr + data) })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      resolve({ stdout, stderr: stderr || '命令执行超时（30秒）', exitCode: -1, platform: process.platform })
    }, 30000)

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code, platform: process.platform })
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr: err.message, exitCode: -1, platform: process.platform })
    })
  })
})

let win: BrowserWindow | null

function hideWindowMenu(window: BrowserWindow) {
  window.setMenu(null)
  window.setAutoHideMenuBar(true)
  window.setMenuBarVisibility(false)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  hideWindowMenu(win)

  if (RENDERER_URL) {
    win.loadURL(RENDERER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.on('closed', () => {
    win = null
  })
}

app.on('browser-window-created', (_event, window) => {
  hideWindowMenu(window)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
})
