import React from 'react'
import { CheckCircle2, ChevronDown, Copy, Terminal, XCircle } from 'lucide-react'

interface TerminalProps {
  command: string
  platform: string
  output: string
  exitCode: number | null
}

const TerminalComponent: React.FC<TerminalProps> = ({ command, platform, output, exitCode }) => {
  const normalizedOutput = output?.trim() || '(无输出)'
  const isSuccess = exitCode === 0
  const StatusIcon = isSuccess ? CheckCircle2 : XCircle
  const statusText = exitCode === null ? '执行中' : isSuccess ? '执行成功' : '执行失败'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(normalizedOutput)
    } catch {
      // Clipboard access can be unavailable in restricted contexts.
    }
  }

  return (
    <details className="group my-3 overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-colors open:border-primary/25">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm marker:hidden hover:bg-muted/45 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Terminal size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <StatusIcon size={15} className={isSuccess ? 'text-success' : 'text-destructive'} />
            {statusText}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
            {command}
          </span>
        </span>
        <span className="hidden rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex">
          {platform || 'terminal'}
          {exitCode !== null ? ` · exit ${exitCode}` : ''}
        </span>
        <ChevronDown size={16} className="text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-border bg-muted/25 px-4 py-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">执行命令</div>
        <pre className="mb-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background/70 p-3 font-mono text-xs leading-relaxed text-foreground">
          {command}
        </pre>

        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">执行输出</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <Copy size={12} />
            复制
          </button>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background/70 p-3 font-mono text-xs leading-relaxed text-foreground">
          {normalizedOutput}
        </pre>
      </div>
    </details>
  )
}

export default TerminalComponent
