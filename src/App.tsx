import { useEffect, useState } from 'react'
import { AlertCircle, Bot, CheckCircle, Moon, PanelLeftClose, PanelLeftOpen, Settings, SquarePen, Sun } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import ChatContainer from '@/components/Chat/ChatContainer'
import Sidebar from '@/components/Sidebar/Sidebar'
import { useChatStore } from '@/store/chatStore'
import { LLMConfig } from '@/types'
import { getLLMConfig, saveLLMConfig, testLLMConfig } from '@/agent/config'
import { resetAgent } from '@/agent'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { pressable, quickFade, softSpring } from '@/lib/motion'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', defaultBaseURL: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { value: 'anthropic', label: 'Anthropic', defaultBaseURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-6' },
  { value: 'deepseek', label: 'DeepSeek', defaultBaseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { value: 'ollama', label: 'Ollama (本地)', defaultBaseURL: 'http://localhost:11434/v1', defaultModel: 'llama3' },
  { value: 'custom', label: '自定义', defaultBaseURL: '', defaultModel: '' }
]

const SIDEBAR_WIDTH_STORAGE_KEY = 'sidebar-width'
const DEFAULT_SIDEBAR_WIDTH = 240
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 420

function getInitialSidebarWidth() {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH

  const storedValue = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
  if (storedValue === null) return DEFAULT_SIDEBAR_WIDTH

  const stored = Number(storedValue)
  if (!Number.isFinite(stored)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, stored))
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth)
  const [showSettings, setShowSettings] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = window.localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [config, setConfig] = useState<LLMConfig>({
    provider: 'deepseek',
    apiKey: '',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  })
  const [testStatus, setTestStatus] = useState<null | { ok: boolean; message: string }>(null)
  const [testing, setTesting] = useState(false)
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false)

  const loadConversations = useChatStore((s) => s.loadConversations)
  const persistConversations = useChatStore((s) => s.persistConversations)
  const createConversation = useChatStore((s) => s.createConversation)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    const handleBeforeUnload = () => {
      persistConversations()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [persistConversations])

  useEffect(() => {
    getLLMConfig().then((c) => {
      setConfig(c)
      setHasSavedApiKey(Boolean(c.hasApiKey))
    })
  }, [])

  const handleProviderChange = (provider: LLMConfig['provider']) => {
    const p = PROVIDERS.find((x) => x.value === provider)
    setConfig((prev) => ({
      ...prev,
      provider,
      baseURL: p?.defaultBaseURL || '',
      model: p?.defaultModel || ''
    }))
    setTestStatus(null)
  }

  const normalizeConfig = (c: LLMConfig): LLMConfig => {
    const trimmed = {
      ...c,
      apiKey: c.apiKey.trim(),
      baseURL: (c.baseURL || '').trim(),
      model: c.model.trim()
    }
    if (trimmed.baseURL && !trimmed.baseURL.endsWith('/v1')) {
      trimmed.baseURL = trimmed.baseURL.replace(/\/$/, '') + '/v1'
    }
    return trimmed
  }

  const handleTest = async () => {
    const normalized = normalizeConfig(config)
    if (!normalized.apiKey && !hasSavedApiKey) {
      setTestStatus({ ok: false, message: '请先填写 API Key' })
      return
    }
    if (!normalized.baseURL) {
      setTestStatus({ ok: false, message: '请先填写 Base URL' })
      return
    }

    setTesting(true)
    setTestStatus(null)
    try {
      setTestStatus(await testLLMConfig(normalized))
    } catch (e) {
      setTestStatus({ ok: false, message: `网络错误: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    const normalized = normalizeConfig(config)
    await saveLLMConfig(normalized)
    setHasSavedApiKey(Boolean(normalized.apiKey || hasSavedApiKey))
    setConfig((prev) => ({ ...prev, apiKey: '', hasApiKey: Boolean(normalized.apiKey || hasSavedApiKey) }))
    resetAgent()
    setShowSettings(false)
    setTestStatus(null)
  }

  const handleNewChat = () => {
    const activeId = useChatStore.getState().activeConversationId
    const conversations = useChatStore.getState().conversations
    const activeConv = conversations.find((c) => c.id === activeId)
    // 如果当前对话已经是空的，不再创建新对话
    if (activeConv && activeConv.messages.length === 0) {
      return
    }
    createConversation()
    persistConversations()
  }

  const selectedProvider = PROVIDERS.find((p) => p.value === config.provider)
  const toolbarButtonClass = 'h-[26px] w-[26px] rounded-sm text-muted-foreground transition-[background-color,color] hover:bg-muted hover:text-foreground'

  const settingsControl = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={toolbarButtonClass}
          aria-label="打开设置"
          title="设置"
        >
          <Settings size={13} strokeWidth={1.85} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>设置</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            主题
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => setTheme(value as 'light' | 'dark')}
            >
              <DropdownMenuRadioItem value="light">
                <Sun size={14} />
                亮色
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon size={14} />
                暗色
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Bot size={14} />
            模型设置
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuLabel>{selectedProvider?.label || '未配置'}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => setShowSettings(true)}
            >
              <Settings size={14} />
              配置模型
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="aurora-bg flex h-screen flex-col overflow-hidden text-foreground">
      <div className="window-drag z-20 flex h-8 shrink-0 items-center border-b border-border bg-background/95 px-1.5">
        <div className="window-no-drag flex items-center gap-1">
          <motion.div {...pressable}>
            <Button
              variant="ghost"
              size="icon-sm"
              className={toolbarButtonClass}
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? '展开聊天历史' : '收起聊天历史'}
              title={sidebarCollapsed ? '展开聊天历史' : '收起聊天历史'}
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={sidebarCollapsed ? 'open-sidebar' : 'close-sidebar'}
                  initial={{ opacity: 0, x: sidebarCollapsed ? -4 : 4, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: sidebarCollapsed ? 4 : -4, scale: 0.9 }}
                  transition={quickFade}
                  className="grid place-items-center"
                >
                  {sidebarCollapsed
                    ? <PanelLeftOpen size={14} strokeWidth={1.8} />
                    : <PanelLeftClose size={14} strokeWidth={1.8} />}
                </motion.span>
              </AnimatePresence>
            </Button>
          </motion.div>
          <motion.div {...pressable}>
            <Button
              onClick={handleNewChat}
              variant="ghost"
              size="icon-sm"
              className={toolbarButtonClass}
              aria-label="新对话"
              title="新对话"
            >
              <SquarePen size={14} strokeWidth={1.8} />
            </Button>
          </motion.div>
          {settingsControl}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} width={sidebarWidth} onWidthChange={setSidebarWidth} />
        <motion.main layout transition={softSpring} className="min-w-0 flex-1 overflow-hidden bg-background">
          <ChatContainer />
        </motion.main>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="glass-surface max-w-xl">
          <DialogHeader>
            <DialogTitle>LLM 配置</DialogTitle>
            <DialogDescription>配置兼容 OpenAI 协议的模型服务，保存后会立即重置 Agent 连接。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="provider">Provider</label>
              <select
                id="provider"
                value={config.provider}
                onChange={(e) => handleProviderChange(e.target.value as LLMConfig['provider'])}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition-[background-color,border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="api-key">API Key</label>
              <Input
                id="api-key"
                type="password"
                value={config.apiKey}
                onChange={(e) => { setConfig((prev) => ({ ...prev, apiKey: e.target.value })); setTestStatus(null) }}
                placeholder={hasSavedApiKey ? '已保存，留空则沿用当前 Key' : 'sk-...'}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="base-url">Base URL</label>
              <Input
                id="base-url"
                type="text"
                value={config.baseURL}
                onChange={(e) => { setConfig((prev) => ({ ...prev, baseURL: e.target.value })); setTestStatus(null) }}
                placeholder="https://api.deepseek.com/v1"
              />
              <p className="text-xs text-muted-foreground">OpenAI 兼容协议需要以 /v1 结尾，保存时会自动补全。</p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="model">Model</label>
              <Input
                id="model"
                type="text"
                value={config.model}
                onChange={(e) => { setConfig((prev) => ({ ...prev, model: e.target.value })); setTestStatus(null) }}
                placeholder={config.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o'}
              />
            </div>
          </div>

          {testStatus && (
            <div className={`animate-fade-up flex items-start gap-2 rounded-md border p-3 text-sm ${
              testStatus.ok
                ? 'border-success/25 bg-success/10 text-success'
                : 'border-destructive/25 bg-destructive/10 text-destructive'
            }`}>
              {testStatus.ok ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
              <span>{testStatus.message}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSettings(false)}>
              取消
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !config.apiKey.trim()}>
              {testing ? '测试中...' : '测试连接'}
            </Button>
            <Button onClick={handleSave}>
              保存配置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
