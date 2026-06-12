import React, { useEffect, useState } from 'react'
import { ChevronDown, Loader } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface ThinkingPanelProps {
  thinking: string
  complete: boolean
}

const ThinkingPanel: React.FC<ThinkingPanelProps> = ({ thinking, complete }) => {
  const [expanded, setExpanded] = useState(!complete)

  useEffect(() => {
    setExpanded(!complete)
  }, [complete])

  // 没有 thinking 内容时不显示
  if (!thinking || thinking.length === 0) {
    return null
  }

  return (
    <Card className="mb-2 w-[36rem] max-w-full overflow-hidden border-border/60 bg-card/55 shadow-none">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/30"
      >
        {complete ? (
          <span className="h-1.5 w-1.5 rounded-sm bg-muted-foreground/45" aria-hidden="true" />
        ) : (
          <Loader size={12} className="animate-spin text-muted-foreground/70" />
        )}
        <span className="min-w-0 flex-1 font-medium">{complete ? '思考过程' : '思考中'}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-muted-foreground/70 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="animate-slide-in-from-top border-t border-border/50 bg-muted/20 px-3 py-2.5">
          <div className="max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-muted-foreground/85">
            {thinking}
          </div>
        </div>
      )}
    </Card>
  )
}

export default ThinkingPanel
