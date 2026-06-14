import { create } from 'zustand'
import type { ApprovalKind } from '@/shared/ipc'
import { APPROVAL_TTL_MS } from '@/shared/ipc'

export interface PendingApproval {
  requestId: string
  approvalId: string
  command: string
  reason: string
  kind: ApprovalKind
  expiresAt: number
}

interface ApprovalState {
  pending: PendingApproval | null
  timeoutId: ReturnType<typeof window.setTimeout> | null
  showApproval: (approval: Omit<PendingApproval, 'expiresAt'> & { expiresAt?: number }) => void
  respond: (approved: boolean) => void
  dismiss: () => void
  clearPending: () => void
}

function clearTimeoutIfNeeded(timeoutId: ReturnType<typeof window.setTimeout> | null) {
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId)
  }
}

function sendApprovalResponse(requestId: string, approvalId: string, approved: boolean) {
  if (typeof window !== 'undefined' && window.electronAPI?.respondCommandApproval) {
    window.electronAPI.respondCommandApproval(requestId, approvalId, approved)
  }
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  pending: null,
  timeoutId: null,

  showApproval: (approval) => {
    const { pending, timeoutId } = get()
    if (pending) {
      sendApprovalResponse(pending.requestId, pending.approvalId, false)
    }
    clearTimeoutIfNeeded(timeoutId)

    const nextApproval: PendingApproval = {
      ...approval,
      expiresAt: approval.expiresAt ?? Date.now() + APPROVAL_TTL_MS
    }

    const remaining = Math.max(0, nextApproval.expiresAt - Date.now())
    const nextTimeoutId = window.setTimeout(() => {
      const current = get().pending
      if (current?.approvalId === nextApproval.approvalId) {
        get().respond(false)
      }
    }, remaining)

    set({ pending: nextApproval, timeoutId: nextTimeoutId })
  },

  respond: (approved) => {
    const { pending, timeoutId } = get()
    if (!pending) return

    clearTimeoutIfNeeded(timeoutId)
    sendApprovalResponse(pending.requestId, pending.approvalId, approved)
    set({ pending: null, timeoutId: null })
  },

  dismiss: () => {
    get().respond(false)
  },

  clearPending: () => {
    const { timeoutId } = get()
    clearTimeoutIfNeeded(timeoutId)
    set({ pending: null, timeoutId: null })
  }
}))
