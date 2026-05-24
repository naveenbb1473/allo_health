import { Skeleton } from '@/components/ui/skeleton'

/** Skeleton for a full inventory table row */
export function InventoryRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-900" aria-hidden="true">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-24 ml-auto" />
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-4 w-16" />
    </div>
  )
}

/** Skeleton for the inventory table header + N rows */
export function InventoryTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden" aria-busy="true" aria-label="Loading inventory">
      <div className="flex items-center gap-4 px-6 py-3 bg-zinc-950/80 border-b border-zinc-800">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20 ml-auto" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <InventoryRowSkeleton key={i} />
      ))}
    </div>
  )
}

/** Skeleton for a stat/summary card */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-6" aria-hidden="true">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}
