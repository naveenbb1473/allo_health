'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProductCard, ProductCardSkeleton, type Product, type Warehouse } from '@/components/ProductCard'
import { ErrorState, EmptyState } from '@/components/domain/FeedbackStates'
import { MapPin } from 'lucide-react'


export default function ProductsPage() {
  const [products, setProducts]       = useState<Product[]>([])
  const [warehouses, setWarehouses]   = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [reservingId, setReservingId] = useState<string | null>(null)

  // ── Fetch warehouses + products ───────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [whRes, prodRes] = await Promise.all([
        fetch('/api/warehouses'),
        fetch('/api/products'),
      ])

      if (!whRes.ok)   throw new Error('Failed to fetch warehouses')
      if (!prodRes.ok) throw new Error('Failed to fetch products')

      const [warehouseData, productsData] = await Promise.all([
        whRes.json()   as Promise<Warehouse[]>,
        prodRes.json() as Promise<Product[]>,
      ])

      setWarehouses(warehouseData)
      setProducts(productsData)
      setSelectedWarehouseId(warehouseData[0]?.id ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  // ── Reserve handler ───────────────────────────────────────────────────────
  const handleReserve = useCallback(
    async (productId: string, warehouseId: string, quantity: number) => {
      const CUSTOMER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' // Demo customer UUID

      setReservingId(productId)
      try {
        const res = await fetch('/api/reservations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            warehouseId,
            quantity,
            customerId: CUSTOMER_ID,
          }),
        })

        if (res.status === 201) {
          const data = await res.json()
          toast.success('Reservation created!', {
            description: `Expires at ${new Date(data.expiresAt).toLocaleTimeString()}`,
          })
          // Refresh product list to show updated stock
          void fetchData()
        } else if (res.status === 409) {
          const data = await res.json()
          toast.error('Insufficient stock', {
            description: data.message ?? 'Not enough units available',
          })
        } else {
          const data = await res.json().catch(() => ({}))
          toast.error('Reservation failed', {
            description: data.errorId ? `Support ID: ${data.errorId}` : 'Please try again.',
          })
        }
      } catch {
        toast.error('Network error', { description: 'Could not reach the server.' })
      } finally {
        setReservingId(null)
      }
    },
    [fetchData],
  )

  // ── Selected warehouse label ──────────────────────────────────────────────
  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId)

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-8">
        <PageHeader loading />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <ErrorState
          title="Failed to load inventory"
          message={error}
          onRetry={fetchData}
        />
      </div>
    )
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (products.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader warehouses={warehouses} selected={selectedWarehouseId} onSelect={setSelectedWarehouseId} />
        <EmptyState
          title="No products available"
          message="Inventory is currently empty for this warehouse."
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header + warehouse selector */}
      <PageHeader
        warehouses={warehouses}
        selected={selectedWarehouseId}
        onSelect={setSelectedWarehouseId}
        productCount={products.length}
        warehouseLabel={selectedWarehouse ? `${selectedWarehouse.name} · ${selectedWarehouse.location}` : undefined}
      />

      {/* Product grid */}
      <section aria-label="Product inventory">
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              selectedWarehouseId={selectedWarehouseId}
              warehouses={warehouses}
              onReserve={handleReserve}
              isReserving={reservingId === product.id}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface PageHeaderProps {
  warehouses?: Warehouse[]
  selected?: string
  onSelect?: (id: string) => void
  productCount?: number
  warehouseLabel?: string
  loading?: boolean
}

function PageHeader({
  warehouses = [],
  selected = '',
  onSelect,
  productCount,
  warehouseLabel,
  loading = false,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      {/* Title block */}
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">Inventory</h1>
        {loading ? (
          <div className="h-4 w-64 animate-pulse rounded bg-zinc-800" aria-hidden="true" />
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-zinc-400">
            {productCount !== undefined && (
              <span className="font-semibold text-zinc-300">{productCount} products</span>
            )}
            {warehouseLabel && (
              <>
                <span>·</span>
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{warehouseLabel}</span>
              </>
            )}
          </p>
        )}
      </div>

      {/* Warehouse selector */}
      {!loading && warehouses.length > 0 && (
        <div className="w-full sm:w-72">
          <label htmlFor="warehouse-select" className="sr-only">
            Select warehouse
          </label>
          <Select value={selected} onValueChange={onSelect}>
            <SelectTrigger id="warehouse-select" aria-label="Select warehouse">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  <span className="font-semibold text-zinc-100">{w.name}</span>
                  <span className="ml-1.5 text-zinc-500 text-xs">{w.location}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
