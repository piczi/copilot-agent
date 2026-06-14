import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'
import { MAX_READ_FILE_BYTES } from '../constants'
import { truncateOutput } from '../security/commandPolicy'
import { resolveAllowedPath } from '../security/pathPolicy'

export const readFileTool = tool(
  async ({ path: filePath }) => {
    const trimmedPath = filePath.trim()
    if (!trimmedPath) {
      return JSON.stringify({ error: '文件路径不能为空' })
    }

    const resolved = resolveAllowedPath(trimmedPath)
    if (!resolved.ok) {
      return JSON.stringify({ error: resolved.reason })
    }

    try {
      const stat = await fs.stat(resolved.absolutePath)
      if (!stat.isFile()) {
        return JSON.stringify({ error: '指定路径不是文件' })
      }
      if (stat.size > MAX_READ_FILE_BYTES) {
        return JSON.stringify({ error: `文件过大（超过 ${MAX_READ_FILE_BYTES} 字节），请指定更小的文件或分段读取` })
      }

      const content = await fs.readFile(resolved.absolutePath, 'utf8')
      return JSON.stringify({
        path: path.relative(process.cwd(), resolved.absolutePath) || trimmedPath,
        size: stat.size,
        content: truncateOutput(content)
      }, null, 2)
    } catch (err) {
      return JSON.stringify({
        error: `读取文件失败: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  },
  {
    name: 'read_file',
    description: '读取当前工作区或项目目录内指定文件的文本内容。用户明确要求查看、读取、打开某个文件内容时必须优先使用，不要凭记忆编造文件内容，也不要改用 exec_bash。',
    schema: z.object({
      path: z.string().describe('文件路径，如 README.md、src/App.tsx、package.json')
    })
  }
)
