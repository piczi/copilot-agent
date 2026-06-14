import type { IpcMain } from 'electron'
import type Store from 'electron-store'
import type { LLMConfig } from '@/shared/types'
import {
  cleanConfig,
  DEFAULT_LLM_CONFIG,
  getStoredLLMConfig,
  normalizeBaseURL,
  redactConfig
} from '../agent/llm-config'
import { LLM_CONFIG_KEY } from '../agent/constants'

export function registerLlmConfigIpc(ipcMain: IpcMain, store: Store): void {
  ipcMain.handle('get-llm-config', () => {
    return redactConfig(getStoredLLMConfig(store))
  })

  ipcMain.handle('save-llm-config', (_event, config: Partial<LLMConfig>) => {
    const existing = getStoredLLMConfig(store)
    store.set(LLM_CONFIG_KEY, cleanConfig(config, existing))
  })

  ipcMain.handle('test-llm-config', async (_event, config: Partial<LLMConfig>) => {
    const normalized = cleanConfig(config, getStoredLLMConfig(store))
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
}

export function createStoreBackedLlmConfig(store: Store) {
  return {
    get: () => getStoredLLMConfig(store),
    default: DEFAULT_LLM_CONFIG
  }
}
