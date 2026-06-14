import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { getRuntimeContext } from '../context'
import { createTerminalBlock } from '../content-router'
import { MAX_COMMAND_LENGTH } from '../constants'
import {
  getCommandApprovalReason,
  getPlatformName,
  restrictedCommandNeedsApproval
} from '../security/commandPolicy'

export const execBashTool = tool(
  async ({ command }, config) => {
    const runtime = getRuntimeContext(config)
    const trimmedCommand = command.trim()

    if (!trimmedCommand) {
      return JSON.stringify({
        platform: getPlatformName(),
        command,
        output: '命令不能为空',
        exitCode: -1
      })
    }

    if (trimmedCommand.length > MAX_COMMAND_LENGTH) {
      return JSON.stringify({
        platform: getPlatformName(),
        command: trimmedCommand,
        output: '命令过长',
        exitCode: -1
      })
    }

    if (!runtime) {
      return JSON.stringify({ error: '运行时上下文不可用' })
    }

    const baseText = runtime.visibleTextRef.current.replace(/\s+$/, '')
    const separator = baseText ? '\n\n' : ''

    if (runtime.commandMode === 'restricted' && restrictedCommandNeedsApproval(trimmedCommand)) {
      const reason = getCommandApprovalReason(trimmedCommand)
      const approved = await runtime.requestApproval(trimmedCommand, reason, 'command')
      if (!approved) {
        const cancelled = {
          platform: getPlatformName(),
          command: trimmedCommand,
          output: '命令已取消：用户未批准执行。',
          exitCode: -1
        }
        const finalText = `${baseText}${separator}${createTerminalBlock(cancelled.command, cancelled.platform, cancelled.output, cancelled.exitCode)}`
        runtime.visibleTextRef.current = finalText
        runtime.emit({ type: 'replace_text', chunk: finalText })
        return JSON.stringify(cancelled)
      }
    }

    const result = await runtime.runCommand(trimmedCommand)
    const output = result.stdout || result.stderr || '(无输出)'
    const payload = {
      platform: getPlatformName(),
      command: trimmedCommand,
      output,
      exitCode: result.exitCode
    }
    const finalText = `${baseText}${separator}${createTerminalBlock(payload.command, payload.platform, payload.output, payload.exitCode)}`
    runtime.visibleTextRef.current = finalText
    runtime.emit({ type: 'replace_text', chunk: finalText })
    return JSON.stringify(payload)
  },
  {
    name: 'exec_bash',
    description: [
      '真实执行当前电脑上的系统命令，作为兜底 escalator 处理其他专用工具无法覆盖的只读任务。',
      '适用：专用工具失败后的只读诊断、fetch_url 无法覆盖但可用只读命令完成的场景。',
      '禁止用 curl/wget 重复抓取天气、汇率、加密货币、黄金等已接入专用数据；这类数据应使用对应专用工具。',
      '读取单个文件或列出目录时不要使用本工具，应优先 read_file、list_directory。',
      'Windows 使用 PowerShell，macOS/Linux 使用 /bin/sh -c。',
      '每次用户请求内尽量少调用；每次调用应使用户目标前进一步。',
      '禁止对同一事实用等价命令重复查询；需要多个相关字段时，优先单条只读命令输出结构化结果（如 JSON），而非多次调用各取一项。',
      '已有足够输出即可回答时，不得再次调用本工具。',
      'restricted 模式下高风险、写入、网络请求或组合命令会请求用户审批；仍应尝试，不要因可能需要审批而直接拒绝。',
      'dangerous 模式下用户已允许直接执行。'
    ].join(' '),
    schema: z.object({
      command: z.string().describe('要真实执行的命令。必须符合当前运行平台语法。')
    })
  }
)
