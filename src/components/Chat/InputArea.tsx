import { useRef, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Send, ShieldCheck, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useChatStore } from '@/store/chatStore'
import { useSendMessage } from '@/hooks/useSendMessage'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CommandMode } from '@/types'
import { chatContentClass } from '@/lib/layout'
import { pressable, quickFade, softSpring } from '@/lib/motion'

const modes: Array<{ value: CommandMode; label: string; icon: typeof ShieldCheck }> = [
  { value: 'restricted', label: '受限模式', icon: ShieldCheck },
  { value: 'dangerous', label: '危险模式', icon: AlertTriangle }
]

const InputArea: React.FC = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!isLoading) {
        handleSend()
      }
    }
  }

  return (
    <div className="relative bg-background px-5 py-3">
      <div className={`relative ${chatContentClass}`}>
        <motion.div
          layout
          animate={{
            y: focused ? -1 : 0,
            boxShadow: focused ? '0 18px 42px -32px hsl(var(--primary) / 0.8)' : '0 0 0 0 hsl(var(--primary) / 0)'
          }}
          transition={softSpring}
          className="relative rounded-md"
        >
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="输入你的问题，Shift + Enter 换行..."
            disabled={isLoading}
            className="min-h-[88px] max-h-[180px] rounded-md border-border bg-muted/20 pb-14 pr-16 shadow-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/15"
          />
          <motion.div
            className="absolute bottom-3 right-3"
            {...(!isLoading && !text.trim() ? {} : pressable)}
          >
            <Button
              onClick={isLoading ? handleStop : handleSend}
              disabled={!isLoading && !text.trim()}
              size="icon-sm"
              className="h-8 w-8 rounded-md shadow-none"
              aria-label={isLoading ? '停止生成' : '发送消息'}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={isLoading ? 'stop' : 'send'}
                  initial={{ opacity: 0, rotate: -12, scale: 0.82 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 12, scale: 0.82 }}
                  transition={quickFade}
                  className="grid place-items-center"
                >
                  {isLoading ? <Square size={14} fill="currentColor" /> : <Send size={14} />}
                </motion.span>
              </AnimatePresence>
            </Button>
          </motion.div>
        </motion.div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-[11px] text-muted-foreground">
          <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
            {modes.map(({ value, label, icon: Icon }) => {
              const active = commandMode === value
              return (
                <motion.button
                  key={value}
                  type="button"
                  onClick={() => setCommandMode(value)}
                  whileTap={{ scale: 0.97 }}
                  transition={quickFade}
                  className={`relative inline-flex h-7 cursor-pointer items-center gap-1.5 overflow-hidden rounded-sm px-2.5 transition-colors duration-150 ${
                    active
                      ? value === 'dangerous'
                        ? 'text-destructive'
                        : 'text-primary'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  }`}
                  aria-pressed={active}
                >
                  {active && (
                    <motion.span
                      layoutId="command-mode-active"
                      className={`absolute inset-0 rounded-sm ${
                        value === 'dangerous' ? 'bg-destructive/15' : 'bg-primary/15'
                      }`}
                      transition={softSpring}
                    />
                  )}
                  <Icon size={13} className="relative z-10" />
                  <span className="relative z-10">{label}</span>
                </motion.button>
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
