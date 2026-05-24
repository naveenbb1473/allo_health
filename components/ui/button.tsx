import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-600 text-white shadow hover:bg-blue-700 transition-all cursor-pointer font-bold',
        destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-700 transition-all cursor-pointer font-bold',
        outline: 'border border-zinc-800 bg-zinc-950/40 shadow-sm hover:bg-zinc-900 hover:text-zinc-100 text-zinc-300 transition-all cursor-pointer font-semibold',
        ghost: 'hover:bg-zinc-900 hover:text-zinc-100 text-zinc-400 transition-all cursor-pointer font-medium',
        link: 'text-blue-500 underline-offset-4 hover:underline transition-all cursor-pointer font-medium',
      },
      size: {
        default: 'h-11 px-4 py-2 min-h-[44px]',
        sm: 'h-10 rounded-md px-3 text-sm min-h-[44px]',
        lg: 'h-12 rounded-md px-8 min-h-[48px]',
        icon: 'h-11 w-11 min-h-[44px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
