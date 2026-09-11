// Componente Slider accesible con Base UI y tokens del tema morado
import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react"
import { cn } from "@/lib/utils"

export interface SliderProps
  extends Omit<React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>, "value" | "defaultValue" | "onValueChange"> {
  className?: string
  value?: number | readonly number[]
  defaultValue?: number | readonly number[]
  onValueChange?: (value: number | readonly number[]) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  "aria-label"?: string
}

export function Slider({
  className,
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  "aria-label": ariaLabel,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "relative flex w-full touch-none select-none items-center py-1",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full items-center">
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted border border-border">
          <SliderPrimitive.Indicator className="absolute h-full bg-primary rounded-full" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={ariaLabel}
          className="block size-4 rounded-full border-2 border-primary bg-background shadow-xs transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none cursor-pointer hover:scale-110"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
