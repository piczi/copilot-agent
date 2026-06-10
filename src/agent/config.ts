import { LLMConfig } from '@/types'

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'deepseek',
  apiKey: '',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
}

function cleanConfig(config: LLMConfig): LLMConfig {
  return {
    ...config,
    apiKey: config.apiKey?.trim() || '',
    baseURL: config.baseURL?.trim() || '',
    model: config.model?.trim() || '',
  }
}

export async function getLLMConfig(): Promise<LLMConfig> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return cleanConfig({ ...DEFAULT_CONFIG, ...(await window.electronAPI.getLLMConfig()) })
  }
  return cleanConfig({ ...DEFAULT_CONFIG })
}

export async function saveLLMConfig(config: LLMConfig): Promise<void> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    await window.electronAPI.saveLLMConfig(cleanConfig(config))
  }
}

export async function testLLMConfig(config: LLMConfig) {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI.testLLMConfig(cleanConfig(config))
  }
  return { ok: false, message: '当前环境不支持测试连接' }
}
