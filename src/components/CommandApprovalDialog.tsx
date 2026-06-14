import { useEffect, useState } from 'react'
import { Globe, Terminal } from 'lucide-react'
import { useApprovalStore } from '@/store/approvalStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

function formatRemainingSeconds(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
}

const CommandApprovalDialog: React.FC = () => {
  const pending = useApprovalStore((s) => s.pending)
  const respond = useApprovalStore((s) => s.respond)
  const dismiss = useApprovalStore((s) => s.dismiss)
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  useEffect(() => {
    if (!pending) return

    const updateRemaining = () => {
      setRemainingSeconds(formatRemainingSeconds(pending.expiresAt))
    }

    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [pending])

  const isUrl = pending?.kind === 'url'
  const title = isUrl ? '允许网络请求' : '允许执行命令'
  const Icon = isUrl ? Globe : Terminal

  return (
    <Dialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex w-[calc(100%-2rem)] max-w-md flex-col gap-0 p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-1.5 px-4 pt-4">
          <DialogTitle className="text-sm font-medium">{title}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Agent 请求执行以下操作，请确认后决定是否允许。
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Icon size={10} />
              <span>{isUrl ? '请求地址' : '待执行命令'}</span>
            </div>
            <div className="max-h-32 min-w-0 overflow-auto rounded border border-border/60 bg-muted/20 px-2.5 py-2 font-mono text-[11px] leading-relaxed break-all text-foreground/90">
              {pending?.command}
            </div>
          </div>

          {pending?.reason && (
            <p className="min-w-0 text-xs break-all text-muted-foreground">
              <span className="text-foreground/80">原因：</span>
              {pending.reason}
            </p>
          )}

          <p className="text-[10px] text-muted-foreground/70">
            {remainingSeconds > 0
              ? `${remainingSeconds} 秒内未响应将自动拒绝`
              : '审批即将超时，将自动拒绝'}
          </p>
        </div>

        <DialogFooter className="flex w-full min-w-0 flex-row items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => respond(false)}
          >
            拒绝
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={() => respond(true)}
          >
            {isUrl ? '允许' : '允许执行'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CommandApprovalDialog
