export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'deepseek' | 'ollama' | 'custom'
  apiKey: string
  baseURL?: string
  model: string
  proxy?: string
  hasApiKey?: boolean
}

export type CommandMode = 'restricted' | 'dangerous'

export interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ExecCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  platform: string
  approvalRequired?: boolean
  approvalToken?: string
  reason?: string
}

export interface LLMTestResult {
  ok: boolean
  message: string
}

export interface VisualBlock {
  type: string
  data: Record<string, unknown>
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  thinkingComplete?: boolean
  visuals?: VisualBlock[]
  toolCalls?: ToolCall[]
  timestamp: number
}

export interface ToolCall {
  name: string
  arguments: string
  result?: string
}

export interface WeatherData {
  city: string
  temperature: number
  feelsLike: number
  condition: string
  humidity: number
  windSpeed: number
  forecast: Array<{
    day: string
    high: number
    low: number
    condition: string
  }>
}

export interface ExchangeRateData {
  base: string
  target: string
  rates: Array<{
    date: string
    rate: number
  }>
}

export interface CryptoData {
  id: string
  name: string
  symbol: string
  currentPrice: number
  priceChange24h: number
  marketCap: number
  history: Array<{
    date: string
    price: number
  }>
}

export interface GoldData {
  name: string
  symbol: string
  unit: string
  currentPrice: number
  priceChange24h: number
  history: Array<{
    date: string
    price: number
  }>
}
