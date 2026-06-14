import { ChatOpenAI } from '@langchain/openai'
import type { LLMConfig } from '@/shared/types'
import { normalizeBaseURL } from './llm-config'

export function createChatModel(config: LLMConfig): ChatOpenAI {
  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    configuration: {
      baseURL: normalizeBaseURL(config.baseURL)
    },
    temperature: 0.7,
    streaming: true
  })
}
