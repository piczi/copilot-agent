import { AIMessage, type BaseMessage } from '@langchain/core/messages'

const REFUSAL_PATTERNS = [
  /无法完成/,
  /暂时无法/,
  /不能(?:帮您|为你|完成|提供|查询|获取)/,
  /没办法/,
  /不支持(?:该|此|这)/,
  /超出(?:我的)?能力/,
  /不在(?:我的)?能力范围/,
  /没有(?:相应|相关)(?:的)?能力/,
  /无法(?:帮您|为你|直接|准确)?(?:查询|获取|提供|访问|完成)/,
  /抱歉.*(?:无法|不能)/
]

const FACTUAL_REQUEST_PATTERNS = [
  /查询|查一下|帮我查|看看|获取|多少|价格|股价|汇率|天气|内存|磁盘|CPU|版本|列出|读取|打开|下载|访问|请求|api|http/i,
  /\d+/,
  /什么|多少|哪个|哪里|何时|如何|怎么|是否/
]

const CHITCHAT_PATTERNS = [
  /^(你好|您好|嗨|hello|hi|谢谢|感谢|再见|拜拜)[!！。]?$/i,
  /^你是谁[？?]?$/,
  /^(解释|说明|翻译|改写|总结|润色)/,
  /什么意思$/
]

export function isLikelyRefusal(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function isLikelyFactualRequest(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  if (CHITCHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false
  }
  return FACTUAL_REQUEST_PATTERNS.some((pattern) => pattern.test(trimmed))
}

export function getLastAssistantText(messages: BaseMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!AIMessage.isInstance(message)) continue
    if (message.tool_calls && message.tool_calls.length > 0) {
      return ''
    }
    const content = typeof message.content === 'string' ? message.content : ''
    if (content.trim()) {
      return content
    }
  }
  return ''
}

export function shouldRetryRefusal(userMessage: string, assistantContent: string): boolean {
  if (!assistantContent.trim()) return false
  if (!isLikelyFactualRequest(userMessage)) return false
  return isLikelyRefusal(assistantContent)
}

export const REFUSAL_RETRY_PROMPT = [
  '你刚才在未尝试任何获取方式的情况下直接回复了“无法完成”。',
  '请重新处理用户的原始问题：先按升级顺序尝试合理的只读获取方式（专用数据查询、读文件/列目录、本机只读命令、受控公开网络读取），',
  '前一步失败再升级；若需要用户审批仍应发起尝试。',
  '只有在合理路径都失败或用户拒绝授权后，才向用户说明暂时无法完成。'
].join('\n')
