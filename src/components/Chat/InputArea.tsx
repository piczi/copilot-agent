import { useRef, useCallback, useEffect } from 'react'
import { AlertTriangle, Send, ShieldCheck, Square } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'
import { useSendMessage } from '@/hooks/useSendMessage'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CommandMode } from '@/types'

const modes: Array<{ value: CommandMode; label: string; icon: typeof ShieldCheck }> = [
  { value: 'restricted', label: '受限模式', icon: ShieldCheck },
  { value: 'dangerous', label: '危险模式', icon: AlertTriangle }
]

const InputArea: React.FC = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const text = useChatStore((s) => s.inputText)
  const setText = useChatStore((s) => s.setInputText)
  const isLoading = useChatStore((s) => s.isLoading)
  const commandMode = useChatStore((s) => s.commandMode)
  const setCommandMode = useChatStore((s) => s.setCommandMode)
  const abort = useChatStore((s) => s.abort)
  const sendMessage = useSendMessage()

  const autoResize = useCallback(() => {
    const target = textareaRef.current
    if (!target) return
    target.style.height = 'auto'
    const newHeight = target.scrollHeight
    const maxHeight = 200
    if (newHeight > maxHeight) {
      target.style.height = `${maxHeight}px`
      target.style.overflowY = 'auto'
    } else {
      target.style.height = `${newHeight}px`
      target.style.overflowY = 'hidden'
    }
  }, [])

  useEffect(() => {
    autoResize()
  }, [text])

  const handleSend = useCallback(() => {
    sendMessage()
  }, [sendMessage])

  const handleStop = useCallback(() => {
    abort()
  }, [abort])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading) {
        handleSend()
      }
    }
  }

  return (
    <div className="relative bg-background px-5 py-3">
      <div className="relative mx-auto max-w-4xl">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题，Shift + Enter 换行..."
            disabled={isLoading}
            className="min-h-[88px] max-h-[180px] rounded-md border-border bg-muted/20 pb-14 pr-16 shadow-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/15"
          />
          <Button
            onClick={isLoading ? handleStop : handleSend}
            disabled={!isLoading && !text.trim()}
            size="icon-sm"
            className="absolute bottom-3 right-3 h-8 w-8 rounded-md shadow-none"
            aria-label={isLoading ? '停止生成' : '发送消息'}
          >
            {isLoading ? <Square size={14} fill="currentColor" /> : <Send size={14} />}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-[11px] text-muted-foreground">
          <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
            {modes.map(({ value, label, icon: Icon }) => {
              const active = commandMode === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCommandMode(value)}
                  className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 transition-[background-color,color] duration-150 ${
                    active
                      ? value === 'dangerous'
                        ? 'bg-destructive/15 text-destructive'
                        : 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  }`}
                  aria-pressed={active}
                >
                  <Icon size={13} />
                  {label}
                </button>
              )
            })}
          </div>
          <span className={commandMode === 'dangerous' ? 'text-destructive' : 'text-muted-foreground'}>
            {commandMode === 'dangerous'
              ? '危险模式：命令将不再要求审批'
              : '受限模式：高危命令执行前需要审批'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default InputArea
