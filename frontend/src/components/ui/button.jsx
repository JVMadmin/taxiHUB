import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F5DFF] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#4F5DFF] text-white hover:bg-[#3D49D6] shadow-[0_4px_16px_rgba(79,93,255,0.25)]",
        destructive:
          "bg-[#F4544C] text-white hover:bg-[#E03E36] shadow-sm",
        outline:
          "border border-white/[0.08] bg-transparent hover:bg-white/[0.06] text-foreground",
        secondary:
          "border border-white/[0.06] bg-[#1B1E24] text-foreground hover:bg-[#22252C]",
        ghost: "hover:bg-white/[0.08] text-muted-foreground hover:text-foreground",
        link: "text-[#4F5DFF] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8.5 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
