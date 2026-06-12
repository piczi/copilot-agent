import React, { useMemo } from 'react'
import { CloudSun, Coins, Sparkles, TrendingUp } from 'lucide-react'
import { motion } from 'motion/react'
import { useChatStore } from '@/store/chatStore'
import { useSendMessage } from '@/hooks/useSendMessage'
import MessageList from './MessageList'
import InputArea from './InputArea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { chatContentClass } from '@/lib/layout'
import { pressable, quickFade, softSpring } from '@/lib/motion'

const quickQuestions = [
  { icon: CloudSun, label: '北京今天天气怎么样' },
  { icon: TrendingUp, label: '最近30天美元兑人民币汇率' },
  { icon: Coins, label: '比特币最近行情' }
]

const heroContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04
    }
  }
}

const heroItem = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 }
}

const ChatContainer: React.FC = () => {
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const isLoading = useChatStore((s) => s.isLoading)
  const sendMessage = useSendMessage()
  const isEmpty = useMemo(() => {
    const conv = conversations.find((c) => c.id === activeConversationId)
    return !conv || conv.messages.length === 0
  }, [conversations, activeConversationId])

  const handleQuickQuestion = (q: string) => {
    sendMessage(q)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {isEmpty ? (
        <div className="relative flex h-full flex-col items-center justify-center px-6 py-10">
          <motion.div
            variants={heroContainer}
            initial="hidden"
            animate="visible"
            className="flex w-full max-w-4xl flex-col items-center"
          >
            <motion.div variants={heroItem} transition={softSpring}>
            <Badge variant="outline" className="mb-5 border-border bg-transparent px-2.5 py-1 text-muted-foreground">
              <Sparkles size={13} className="mr-1.5 text-primary" />
              AI Agent 助手
            </Badge>
            </motion.div>
            <motion.h2 variants={heroItem} transition={softSpring} className="max-w-2xl text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              获取天气、汇率和行情洞察
            </motion.h2>
            <motion.p variants={heroItem} transition={softSpring} className="mt-3 max-w-xl text-center text-sm leading-6 text-muted-foreground">
              输入问题后，Agent 会整理结果，并用结构化内容或可视化卡片返回答案。
            </motion.p>
            <motion.div variants={heroItem} transition={softSpring} className="mt-7 grid w-full max-w-2xl gap-2 sm:grid-cols-3">
              {quickQuestions.map(({ icon: Icon, label }) => (
                <motion.div key={label} {...(!isLoading ? pressable : {})}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full justify-start bg-background px-3 text-left text-muted-foreground shadow-none transition-[background-color,color] hover:text-foreground"
                    disabled={isLoading}
                    onClick={() => handleQuickQuestion(label)}
                  >
                    <Icon size={14} />
                    {label}
                  </Button>
                </motion.div>
              ))}
            </motion.div>
            <motion.div variants={heroItem} transition={quickFade} className={`mt-9 ${chatContentClass}`}>
              <InputArea />
            </motion.div>
          </motion.div>
        </div>
      ) : (
        <>
          <MessageList />
          <div className="relative">
            <InputArea />
          </div>
        </>
      )}
    </div>
  )
}

export default ChatContainer
