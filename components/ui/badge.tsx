import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-zinc-900 text-zinc-300 border border-zinc-800',
        success: 'bg-emerald-950/30 text-emerald-400 border border-emerald-805/30',
        warning: 'bg-amber-950/30 text-amber-400 border border-amber-805/30',
        danger: 'bg-red-950/30 text-red-400 border border-red-805/30',
        info: 'bg-blue-950/30 text-blue-400 border border-blue-805/30',
        outline: 'border border-zinc-800 text-zinc-400 bg-zinc-950/40',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
