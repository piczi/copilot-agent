import type { IpcMain } from 'electron'
import type Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { CommandMode } from '@/shared/types'
import { runAgentStream } from '../agent/stream-adapter'
import { getStoredLLMConfig, parseCommandMode } from '../agent/llm-config'
import {
  getCommandApprovalReason,
  restrictedCommandNeedsApproval,
  truncateOutput
} from '../agent/security/commandPolicy'
import { resolveCommandCwd } from '../agent/security/pathPolicy'
import { MAX_COMMAND_LENGTH } from '../agent/constants'

const activeChatStreams = new Map<string, () => void>()
const approvalTokens = new Map<string, { command: string; cwd: string; expiresAt: number }>()

function consumeApprovalTokenLocal(token: string | undefined, command: string, cwd: string): boolean {
  if (!token) return false
  const record = approvalTokens.get(token)
  approvalTokens.delete(token)
  return Boolean(record && record.command === command && record.cwd === cwd && record.expiresAt > Date.now())
}

function createApprovalTokenLocal(command: string, cwd: string): string {
  const token = randomUUID()
  approvalTokens.set(token, {
    command,
    cwd,
    expiresAt: Date.now() + 60_000
  })
  return token
}

export function registerChatIpc(ipcMain: IpcMain, store: Store): void {
  ipcMain.on('chat-completion-stream', async (event, requestId: string, message: string, options: { conversationId?: string; mode?: CommandMode } = {}) => {
    const controller = new AbortController()
    activeChatStreams.set(requestId, () => controller.abort())

    const conversationId = typeof options.conversationId === 'string' && options.conversationId
      ? options.conversationId
      : randomUUID()
    const mode = parseCommandMode(options.mode)

    try {
      await runAgentStream({
        llmConfig: getStoredLLMConfig(store),
        conversationId,
        message,
        mode,
        sender: event.sender,
        requestId,
        signal: controller.signal
      })
    } catch (e) {
      if (!controller.signal.aborted) {
        event.sender.send(`chat-completion-stream:${requestId}`, {
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

  ipcMain.handle('exec-command', async (_event, command: string, options: { cwd?: string; mode?: CommandMode; approvalToken?: string } = {}) => {
    return new Promise((resolve) => {
      const mode = parseCommandMode(options.mode)
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
        const tokenApproved = consumeApprovalTokenLocal(options.approvalToken, trimmedCommand, cwdResult.cwd)
        if (!tokenApproved) {
          resolve({
            stdout: '',
            stderr: '',
            exitCode: null,
            platform: process.platform,
            approvalRequired: true,
            approvalToken: createApprovalTokenLocal(trimmedCommand, cwdResult.cwd),
            reason: getCommandApprovalReason(trimmedCommand)
          })
          return
        }
      }

      const isWin = process.platform === 'win32'
      const shell = isWin ? 'powershell.exe' : '/bin/sh'
      const args = isWin
        ? ['-NoProfile', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${trimmedCommand}`]
        : ['-c', trimmedCommand]

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
}
