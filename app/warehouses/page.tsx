'use client'

import { useEffect, useState } from 'react'
import { Building2, MapPin, Package } from 'lucide-react'

interface WarehouseStock {
  id: string
  name: string
  location: string
  _count?: { stock: number }
}

function WarehouseSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-850 bg-zinc-950/40 p-6 shadow-sm animate-pulse">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-zinc-900" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 rounded bg-zinc-900" />
          <div className="h-4 w-28 rounded bg-zinc-900/50" />
        </div>
      </div>
    </div>
  )
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<WarehouseStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/warehouses')
        if (!res.ok) throw new Error('Failed to fetch warehouses')
        const data = await res.json() as WarehouseStock[]
        setWarehouses(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">Warehouses</h1>
        <p className="text-sm text-zinc-400">
          All fulfillment centers in the network
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <WarehouseSkeleton key={i} />)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-950/40 bg-red-950/10 p-6 text-center">
          <p className="text-sm font-semibold text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm text-red-500 underline hover:text-red-400 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && warehouses.length === 0 && (
        <div className="rounded-xl border border-zinc-900 bg-zinc-950/30 p-12 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
          <p className="text-sm text-zinc-400">No warehouses configured yet.</p>
        </div>
      )}

      {/* Warehouse grid */}
      {!loading && !error && warehouses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {warehouses.map((wh) => (
            <div
              key={wh.id}
              className="group rounded-xl border border-zinc-850 bg-zinc-950/50 p-6 shadow-md shadow-black/20 transition duration-200 hover:border-zinc-700 hover:shadow-lg"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-950/40 text-blue-400 group-hover:bg-blue-900/40 transition">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="truncate font-bold text-zinc-100">{wh.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    {wh.location}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-lg bg-zinc-900/40 border border-zinc-900 px-3 py-2">
                <Package className="h-4 w-4 text-zinc-500" />
                <span className="text-xs text-zinc-400">
                  Fulfillment center · active
                </span>
              </div>

              <a
                href={`/products?warehouseId=${wh.id}`}
                className="mt-4 block w-full rounded-lg bg-blue-600 py-2.5 text-center text-sm font-bold text-white transition hover:bg-blue-700 shadow-md"
              >
                View inventory →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
