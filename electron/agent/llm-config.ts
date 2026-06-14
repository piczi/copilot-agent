import { spawn } from 'node:child_process'
import type { CommandMode, LLMConfig } from '@/shared/types'
import { LLM_CONFIG_KEY } from './constants'
import { truncateOutput } from './security/commandPolicy'

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'deepseek',
  apiKey: '',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
}

export function isProvider(value: unknown): value is LLMConfig['provider'] {
  return value === 'openai' || value === 'anthropic' || value === 'deepseek' || value === 'ollama' || value === 'custom'
}

export function cleanConfig(config: Partial<LLMConfig>, existing?: LLMConfig): LLMConfig {
  const provider = isProvider(config.provider) ? config.provider : existing?.provider || DEFAULT_LLM_CONFIG.provider
  const apiKey = typeof config.apiKey === 'string' && config.apiKey.trim()
    ? config.apiKey.trim()
    : existing?.apiKey || ''
  const baseURL = typeof config.baseURL === 'string'
    ? config.baseURL.trim()
    : existing?.baseURL || DEFAULT_LLM_CONFIG.baseURL
  const model = typeof config.model === 'string' && config.model.trim()
    ? config.model.trim()
    : existing?.model || DEFAULT_LLM_CONFIG.model

  return {
    provider,
    apiKey,
    baseURL,
    model,
    proxy: typeof config.proxy === 'string' ? config.proxy.trim() : existing?.proxy
  }
}


export function getStoredLLMConfig(store?: { get: (key: string) => unknown }): LLMConfig {
  if (!store) return cleanConfig(DEFAULT_LLM_CONFIG)
  const stored = store.get(LLM_CONFIG_KEY)
  if (stored && typeof stored === 'object') {
    return cleanConfig(stored as Partial<LLMConfig>, DEFAULT_LLM_CONFIG)
  }
  return cleanConfig(DEFAULT_LLM_CONFIG)
}

export function redactConfig(config: LLMConfig): LLMConfig {
  return {
    ...config,
    apiKey: '',
    hasApiKey: Boolean(config.apiKey)
  }
}

export function normalizeBaseURL(baseURL: string | undefined): string {
  return (baseURL || '').replace(/\/+$/, '')
}

export function runLocalCommand(
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

export function parseCommandMode(mode: unknown): CommandMode {
  return mode === 'dangerous' ? 'dangerous' : 'restricted'
}
