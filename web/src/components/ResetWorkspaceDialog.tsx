import * as Dialog from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import { RotateCcw, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useLabStore } from '../state/useLabStore'

export function ResetWorkspaceDialog({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false)
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const resetConfirmed = useRef(false)
  const scenarioCount = useLabStore((state) => state.scenarios.length)

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) resetConfirmed.current = false
      setTooltipOpen(false)
      setOpen(nextOpen)
    }}>
      <Tooltip.Root open={!open && tooltipOpen} onOpenChange={setTooltipOpen}>
        <Tooltip.Trigger asChild>
          <Dialog.Trigger asChild>
            <button type="button" className="button button--quiet reset-workspace-trigger" aria-label="Reset workspace">
              <RotateCcw aria-hidden="true" />
            </button>
          </Dialog.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="reset-tooltip" sideOffset={8}>Reset workspace</Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog reset-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancelButton.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            if (!resetConfirmed.current) return
            event.preventDefault()
            requestAnimationFrame(() => {
              const heading = document.getElementById('guided-estimate-title')
              heading?.scrollIntoView({ block: 'start' })
              heading?.focus({ preventScroll: true })
            })
          }}
        >
          <div className="dialog__header">
            <Dialog.Title>Reset workspace?</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close reset dialog"><X aria-hidden="true" /></button>
            </Dialog.Close>
          </div>
          <Dialog.Description>
            Delete this browser's estimate, rate profiles, {scenarioCount} saved {scenarioCount === 1 ? 'scenario' : 'scenarios'},
            comparison summaries, and undo history. This cannot be undone.
          </Dialog.Description>
          <p>Sign-in, display preferences, downloaded files, and Azure pricing data are kept.</p>
          <div className="reset-dialog__actions">
            <Dialog.Close asChild><button type="button" ref={cancelButton} className="button">Cancel</button></Dialog.Close>
            <button type="button" className="button button--primary" onClick={() => {
              resetConfirmed.current = true
              onReset()
              setOpen(false)
            }}><Trash2 aria-hidden="true" />Delete and start over</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}