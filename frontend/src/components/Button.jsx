import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Botón unificado del sistema (consolida los 3 patrones detectados en la
// auditoría: .btn-primary-elev inline, bg-brand inline, y <Button> de shadcn).
// primary/destructive envuelven las clases CSS ya existentes en index.css
// (no se reescribe su elevación); secondary/ghost usan los tokens de Tailwind.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "btn-primary-elev",
        destructive: "btn-danger-elev",
        secondary: "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      },
      size: {
        sm: "h-9 px-3 text-xs [&_svg]:size-3.5",
        md: "h-11 px-4 text-sm [&_svg]:size-4",
        lg: "h-14 px-6 text-base [&_svg]:size-5",
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
