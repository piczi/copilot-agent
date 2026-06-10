import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, Moon, Settings, Sun } from 'lucide-react'
import ChatContainer from '@/components/Chat/ChatContainer'
import Sidebar from '@/components/Sidebar/Sidebar'
import { useChatStore } from '@/store/chatStore'
import { LLMConfig } from '@/types'
import { getLLMConfig, saveLLMConfig, testLLMConfig } from '@/agent/config'
import { resetAgent } from '@/agent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', defaultBaseURL: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { value: 'anthropic', label: 'Anthropic', defaultBaseURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-6' },
  { value: 'deepseek', label: 'DeepSeek', defaultBaseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { value: 'ollama', label: 'Ollama (本地)', defaultBaseURL: 'http://localhost:11434/v1', defaultModel: 'llama3' },
  { value: 'custom', label: '自定义', defaultBaseURL: '', defaultModel: '' }
]

function App() {
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem('theme', theme)
  }, [theme])

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

  const selectedProvider = PROVIDERS.find((p) => p.value === config.provider)

  return (
    <div className="aurora-bg flex h-screen flex-col overflow-hidden text-foreground">
      <header className="z-20 flex h-11 items-center justify-between border-b border-border bg-background/95 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-medium tracking-tight">Copilot Agent</h1>
          <Badge variant="outline" className="hidden h-5 border-border bg-transparent px-2 text-[11px] font-normal text-muted-foreground sm:inline-flex">
            {selectedProvider?.label || '未配置'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSettings(true)}
            aria-label="打开设置"
          >
            <Settings size={18} />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden bg-background">
          <ChatContainer />
        </main>
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
                className="h-10 w-full rounded-lg border border-input bg-background/70 px-3 text-sm shadow-sm outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
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
            <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
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
