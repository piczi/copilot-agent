import React from 'react'
import { CheckCircle2, ChevronDown, Copy, Loader, XCircle } from 'lucide-react'

interface TerminalProps {
  command: string
  platform: string
  output: string
  exitCode: number | null
}

const TerminalComponent: React.FC<TerminalProps> = ({ command, platform, output, exitCode }) => {
  const normalizedOutput = output?.trim() || '(无输出)'
  const isRunning = exitCode === null
  const isSuccess = exitCode === 0
  const StatusIcon = isRunning ? Loader : isSuccess ? CheckCircle2 : XCircle

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(normalizedOutput)
    } catch {
      // Clipboard access can be unavailable in restricted contexts.
    }
  }

  return (
    <details className="group my-2 overflow-hidden rounded-md border border-border/50 bg-muted/15 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-muted-foreground marker:hidden hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
        <StatusIcon
          size={12}
          className={
            isRunning
              ? 'shrink-0 animate-spin opacity-70'
              : isSuccess
                ? 'shrink-0 opacity-60'
                : 'shrink-0 text-destructive/70'
          }
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80">
          {command}
        </span>
        <span className="hidden shrink-0 text-[10px] text-muted-foreground/60 sm:inline">
          {platform || 'terminal'}
          {exitCode !== null ? ` · ${exitCode}` : ''}
        </span>
        <ChevronDown size={12} className="shrink-0 opacity-50 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-border/40 px-3 py-2">
        <pre className="mb-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-border/40 bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {command}
        </pre>

        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground/70">输出</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <Copy size={10} />
            复制
          </button>
        </div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border/40 bg-background/50 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {normalizedOutput}
        </pre>
      </div>
    </details>
  )
}

export default TerminalComponent
