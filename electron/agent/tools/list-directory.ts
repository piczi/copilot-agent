import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveAllowedPath } from '../security/pathPolicy'

export const listDirectoryTool = tool(
  async ({ path: dirPath }) => {
    const trimmedPath = (dirPath || '.').trim() || '.'
    const resolved = resolveAllowedPath(trimmedPath)
    if (!resolved.ok) {
      return JSON.stringify({ error: resolved.reason })
    }

    try {
      const stat = await fs.stat(resolved.absolutePath)
      if (!stat.isDirectory()) {
        return JSON.stringify({ error: '指定路径不是目录' })
      }

      const entries = await fs.readdir(resolved.absolutePath, { withFileTypes: true })
      const items = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file'
        }))

      return JSON.stringify({
        path: path.relative(process.cwd(), resolved.absolutePath) || trimmedPath,
        items
      }, null, 2)
    } catch (err) {
      return JSON.stringify({
        error: `列出目录失败: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  },
  {
    name: 'list_directory',
    description: '列出当前工作区或项目目录内指定路径下的文件和文件夹。用户要求查看目录结构、列出项目文件时必须优先使用，不要改用 exec_bash。',
    schema: z.object({
      path: z.string().optional().describe('目录路径，默认为 "."')
    })
  }
)
