"use client"

import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import type { ComponentProps, ReactNode } from "react"

type CollapsibleProps = ComponentProps<"div"> & {
  asChild?: boolean
  children?: ReactNode
  defaultOpen?: boolean
  disabled?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

type CollapsibleTriggerProps = ComponentProps<"button"> & {
  asChild?: boolean
  children?: ReactNode
}

type CollapsibleContentProps = ComponentProps<"div"> & {
  asChild?: boolean
  children?: ReactNode
  forceMount?: true
}

function Collapsible({ ...props }: CollapsibleProps) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsibleTriggerProps) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({ ...props }: CollapsibleContentProps) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
