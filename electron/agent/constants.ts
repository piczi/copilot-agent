export const MAX_CONVERSATIONS = 50
export const MAX_TOOL_TURNS = 10
export const MAX_COMMAND_LENGTH = 2000
export const MAX_OUTPUT_LENGTH = 100_000
export const MAX_READ_FILE_BYTES = 512 * 1024
export const LLM_CONFIG_KEY = 'llm-config'
export const CONVERSATION_INDEX_KEY = 'conversation-index'
export const CONVERSATION_MESSAGE_SNAPSHOTS_KEY = 'conversation-message-snapshots'
export const LEGACY_CONVERSATIONS_KEY = 'conversations'

export const ALLOWED_STORE_KEYS = new Set([
  CONVERSATION_INDEX_KEY,
  LLM_CONFIG_KEY
])
