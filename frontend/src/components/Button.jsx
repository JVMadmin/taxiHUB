import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Botón unificado del sistema (consolida los 3 patrones detectados en la
// auditoría: .btn-primary-elev inline, bg-brand inline, y <Button> de shadcn).
// primary/destructive envuelven las clases CSS ya existentes en index.css
// (no se reescribe su elevación); secondary/ghost usan los tokens de Tailwind.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F5DFF] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-[#4F5DFF] text-white hover:bg-[#3D49D6] shadow-[0_4px_18px_rgba(79,93,255,0.25)] active:translate-y-px",
        destructive: "bg-[#F4544C] text-white hover:bg-[#E03E36] active:translate-y-px",
        secondary: "border border-white/[0.06] bg-[#1B1E24] text-[#F5F5F7] hover:bg-[#22252C]",
        ghost: "text-[#9CA0AA] hover:bg-white/[0.08] hover:text-[#F5F5F7]",
      },
      size: {
        sm: "h-9 px-3.5 text-xs [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "h-10 w-10 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export const Button = React.forwardRef(({ className, variant, size, loading, disabled, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(buttonVariants({ variant, size, className }))}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...props}
  >
    {children}
  </button>
));
Button.displayName = "Button";

export default Button;
