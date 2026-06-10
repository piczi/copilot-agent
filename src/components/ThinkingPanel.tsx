import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Loader } from 'lucide-react'

interface ThinkingPanelProps {
  thinking: string
  complete: boolean
}

const ThinkingPanel: React.FC<ThinkingPanelProps> = ({ thinking, complete }) => {
  const [expanded, setExpanded] = useState(false)

  // 没有 thinking 内容时不显示
  if (!thinking || thinking.length === 0) {
    return null
  }

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {complete ? (
          <>
            <Sparkles size={14} />
            <span>已深度思考</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </>
        ) : (
          <>
            <Loader size={14} className="animate-spin" />
            <span>深度思考中</span>
          </>
        )}
      </button>

      {expanded && (
        <div className="animate-fade-up mt-2 rounded-2xl border border-border/70 bg-muted/45 p-3 text-sm leading-relaxed text-muted-foreground">
          <div className="whitespace-pre-wrap font-mono text-xs">{thinking}</div>
        </div>
      )}
    </div>
  )
}

export default ThinkingPanel
