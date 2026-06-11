import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { CommandMode } from '@/types'

function getCommandMode(): CommandMode {
  if (typeof window === 'undefined') return 'restricted'
  return window.localStorage.getItem('command-mode') === 'dangerous' ? 'dangerous' : 'restricted'
}

export const bashTool = tool(
  async ({ command }) => {
    try {
      if (typeof window === 'undefined' || !window.electronAPI?.execCommand) {
        return '错误: 当前环境不支持执行命令（仅在 Electron 桌面端可用）'
      }

      const mode = getCommandMode()
      let result = await window.electronAPI.execCommand(command, { mode })
      if (result.approvalRequired && result.approvalToken) {
        const approved = window.confirm(`受限模式下该命令需要审批：\n\n${command}\n\n原因：${result.reason || '命令存在风险'}\n\n是否继续执行？`)
        if (!approved) {
          return '命令已取消：用户未批准执行'
        }
        result = await window.electronAPI.execCommand(command, {
          mode,
          approvalToken: result.approvalToken
        })
      }
      const platform = result.platform === 'win32' ? 'Windows' : result.platform === 'darwin' ? 'macOS' : result.platform

      return JSON.stringify({
        platform,
        mode,
        command,
        stdout: result.stdout || '(无输出)',
        stderr: result.stderr || '(无错误输出)',
        exitCode: result.exitCode
      }, null, 2)
    } catch (err) {
      return `执行命令失败: ${err instanceof Error ? err.message : String(err)}`
    }
  },
  {
    name: 'exec_bash',
    description: `执行系统命令行命令（PowerShell / POSIX Shell）。自动适配当前平台（Windows 使用 PowerShell，macOS/Linux 使用 /bin/sh -c）。

安全规则：
1. 受限模式下，安全命令可直接执行，高风险、写入、网络请求或组合命令必须经过用户审批
2. 危险模式下，用户已主动允许执行任意命令
3. 不要主动建议危险命令，除非用户明确要求

跨平台注意：
- Windows 环境: 使用 PowerShell 命令（Get-ChildItem, Get-Content, Select-String, Get-Location, Invoke-RestMethod, curl），不要按 macOS 生成命令
- macOS/Linux: 使用 POSIX 命令（ls, cat, grep, find, pwd, echo, curl, wget）
- 生成命令前必须依据运行平台选择语法；不要在未确认平台时套用另一种操作系统的命令`,
    schema: z.object({
      command: z.string().describe('要执行的命令行命令，如 "ls -la" 或 "dir"')
    })
  }
)
