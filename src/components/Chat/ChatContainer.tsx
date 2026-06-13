import React, { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useChatStore } from '@/store/chatStore'
import MessageList from './MessageList'
import InputArea from './InputArea'
import { Badge } from '@/components/ui/badge'
import { chatContentClass } from '@/lib/layout'
import { quickFade, softSpring } from '@/lib/motion'

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
  const isEmpty = useMemo(() => {
    const conv = conversations.find((c) => c.id === activeConversationId)
    return !conv || conv.messages.length === 0
  }, [conversations, activeConversationId])

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
