import { app } from 'electron'
import path from 'node:path'
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import { MemorySaver } from '@langchain/langgraph'

let checkpointerInstance: SqliteSaver | MemorySaver | null = null

export function getCheckpointer(): SqliteSaver | MemorySaver {
  if (checkpointerInstance) return checkpointerInstance

  try {
    const dbPath = path.join(app.getPath('userData'), 'agent-checkpoints.db')
    checkpointerInstance = SqliteSaver.fromConnString(dbPath)
  } catch {
    checkpointerInstance = new MemorySaver()
  }

  return checkpointerInstance
}

export async function initCheckpointer(): Promise<void> {
  getCheckpointer()
}
