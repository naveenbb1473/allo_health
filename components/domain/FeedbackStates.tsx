import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  title?: string
  message?: string
  errorId?: string
  onRetry?: () => void
}

/** Full-page or section-level error state — never white-screens */
export function ErrorState({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  errorId,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-950/40 bg-red-950/10 p-10 text-center"
    >
      <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden="true" />
      <div>
        <p className="font-semibold text-zinc-100">{title}</p>
        <p className="mt-1 text-sm text-zinc-400">{message}</p>
        {errorId && (
          <p className="mt-2 font-mono text-xs text-zinc-600">
            Support ID: {errorId}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title?: string
  message?: string
  icon?: React.ReactNode
}

/** Empty state for tables / lists with no data */
export function EmptyState({
  title = 'No data',
  message = 'Nothing to show here yet.',
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-900 bg-zinc-950/40 py-16 text-center"
      aria-label={title}
    >
      <p className="font-semibold text-zinc-200">{title}</p>
      <p className="text-sm text-zinc-400">{message}</p>
    </div>
  )
}
