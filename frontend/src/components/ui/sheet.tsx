// Panel lateral deslizante (Sheet) usando Base UI Dialog
import * as React from "react"
import { Dialog } from "@base-ui/react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog.Root>
  )
}

export function SheetContent({
  children,
  className,
  title,
  description,
  onClose,
}: {
  children: React.ReactNode
  className?: string
  title?: string
  description?: string
  onClose?: () => void
}) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity" />
      <Dialog.Popup
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-card p-6 shadow-2xl transition duration-200 border-l border-border overflow-y-auto",
          className
        )}
      >
        <div className="flex items-start justify-between pb-4 border-b border-border">
          <div>
            {title && <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>}
            {description && <Dialog.Description className="text-xs text-muted-foreground mt-0.5">{description}</Dialog.Description>}
          </div>
          <Dialog.Close
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="size-4" />
            <span className="sr-only">Cerrar</span>
          </Dialog.Close>
        </div>
        <div className="pt-4 flex-1 space-y-4">{children}</div>
      </Dialog.Popup>
    </Dialog.Portal>
  )
}
