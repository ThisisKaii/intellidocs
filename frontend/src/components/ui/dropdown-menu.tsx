import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

/** Root dropdown menu container. */
const DropdownMenu = DropdownMenuPrimitive.Root

/** Dropdown menu trigger component. */
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

/** Dropdown menu group wrapper. */
const DropdownMenuGroup = DropdownMenuPrimitive.Group

/** Dropdown menu portal wrapper. */
const DropdownMenuPortal = DropdownMenuPrimitive.Portal

/** Dropdown submenu container. */
const DropdownMenuSub = DropdownMenuPrimitive.Sub

/** Dropdown menu radio group wrapper. */
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

/** Render a sub-trigger row inside a dropdown menu. */
const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-md px-2 py-1.5 text-sm outline-none focus:bg-muted data-[state=open]:bg-muted",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto size-4" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger"

/** Render a submenu panel inside a dropdown menu. */
const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
      className
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName = "DropdownMenuSubContent"

/** Render the main dropdown menu content panel. */
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, style, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-2xl border",
        className
      )}
      style={{
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        boxShadow:
          'rgba(15, 23, 42, 0.12) 0px 18px 40px -12px, rgba(15, 23, 42, 0.06) 0px 8px 16px -8px, inset 0px 0px 0px 1px var(--card-shadow-inner)',
        padding: '0.375rem',
        borderRadius: '0.875rem',
        zIndex: 50,
        ...style,
      }}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = "DropdownMenuContent"

/** Render a clickable dropdown menu item. */
const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, style, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center rounded-xl px-3 py-2.5 text-[0.8125rem] font-medium outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    )}
    style={{
      fontFamily: 'inherit',
      transition: 'background-color 150ms, color 150ms, box-shadow 150ms',
      ...style,
    }}
    onMouseEnter={(e) => {
      const isDestructive = className?.includes('text-destructive')
      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = isDestructive
        ? 'rgba(255, 91, 79, 0.08)'
        : 'var(--secondary)'
      ;(e.currentTarget as HTMLDivElement).style.boxShadow = isDestructive
        ? 'inset 0px 0px 0px 1px rgba(255, 91, 79, 0.12)'
        : 'inset 0px 0px 0px 1px var(--border)'
      if (!isDestructive) {
        ;(e.currentTarget as HTMLDivElement).style.color = 'var(--foreground)'
      }
    }}
    onMouseLeave={(e) => {
      const isDestructive = className?.includes('text-destructive')
      ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
        typeof style?.backgroundColor === 'string' ? style.backgroundColor : 'transparent'
      ;(e.currentTarget as HTMLDivElement).style.boxShadow =
        typeof style?.boxShadow === 'string' ? style.boxShadow : 'none'
      if (!isDestructive) {
        ;(e.currentTarget as HTMLDivElement).style.color =
          typeof style?.color === 'string' ? style.color : ''
      }
    }}
    {...props}
  />
))
DropdownMenuItem.displayName = "DropdownMenuItem"

/** Render a checkbox-style dropdown item. */
const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="size-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem"

/** Render a radio-style dropdown item. */
const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="size-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem"

/** Render a dropdown menu label. */
const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)}
    {...props}
  />
))
DropdownMenuLabel.displayName = "DropdownMenuLabel"

/** Render a dropdown menu divider. */
const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = "DropdownMenuSeparator"

/** Render a keyboard shortcut hint. */
const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
    {...props}
  />
)
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}