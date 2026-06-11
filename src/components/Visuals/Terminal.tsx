import React from 'react'
import { Terminal } from 'lucide-react'

interface TerminalProps {
  command: string
  platform: string
  output: string
  exitCode: number | null
}

const TerminalComponent: React.FC<TerminalProps> = ({ command }) => {
  return (
    <div className="my-1.5 flex max-w-full items-center gap-1.5 text-[11px] text-muted-foreground/55">
      <Terminal size={11} className="shrink-0 text-muted-foreground/40" />
      <span className="shrink-0 select-none">命令</span>
      <code
        className="min-w-0 overflow-x-auto whitespace-nowrap font-mono text-muted-foreground/60 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        title={command}
      >
        {command}
      </code>
    </div>
  )
}

export default TerminalComponent
