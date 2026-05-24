'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StockBadge } from '@/components/domain/StockBadge'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

interface WarehouseStock {
  warehouseId: string
  total: number
  reserved: number
  available: number
}

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl?: string | null
  warehouses: WarehouseStock[]
}

export interface Warehouse {
  id: string
  name: string
  location: string
}

interface ProductCardProps {
  product: Product
  selectedWarehouseId: string
  warehouses: Warehouse[]
  onReserve: (productId: string, warehouseId: string, quantity: number) => void
  isReserving?: boolean
}

export function ProductCard({
  product,
  selectedWarehouseId,
  warehouses,
  onReserve,
  isReserving = false,
}: ProductCardProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmWarehouseId, setConfirmWarehouseId] = useState(selectedWarehouseId)
  const [quantity, setQuantity] = useState(1)

  const warehouseStock = useMemo(
    () => product.warehouses.find((w) => w.warehouseId === selectedWarehouseId),
    [product.warehouses, selectedWarehouseId],
  )

  const available = warehouseStock?.available ?? 0
  const isOutOfStock = available <= 0
  const noWarehouseSelected = !selectedWarehouseId || !warehouseStock

  // Resolve full details of warehouses this product has stock records for
  const availableWarehouses = useMemo(() => {
    return product.warehouses.map((wStock) => {
      const wh = warehouses.find((w) => w.id === wStock.warehouseId)
      return {
        ...wStock,
        name: wh?.name ?? 'Unknown Warehouse',
        location: wh?.location ?? '',
      }
    })
  }, [product.warehouses, warehouses])

  const selectedConfirmStock = useMemo(
    () => availableWarehouses.find((w) => w.warehouseId === confirmWarehouseId),
    [availableWarehouses, confirmWarehouseId]
  )

  const maxQuantity = selectedConfirmStock?.available ?? 0

  const handleWarehouseChange = (whId: string) => {
    setConfirmWarehouseId(whId)
    const nextWhStock = availableWarehouses.find((w) => w.warehouseId === whId)
    const nextMax = nextWhStock?.available ?? 0
    setQuantity((prev) => Math.max(1, Math.min(prev, nextMax)))
  }

  function handleReserveClick() {
    if (!isOutOfStock && selectedWarehouseId) {
      setConfirmWarehouseId(selectedWarehouseId)
      setQuantity(1)
      setShowConfirm(true)
    }
  }

  function handleConfirmReserve() {
    if (confirmWarehouseId && selectedConfirmStock && selectedConfirmStock.available > 0) {
      onReserve(product.id, confirmWarehouseId, quantity)
      setShowConfirm(false)
    }
  }

  return (
    <>
      {/* ── Product Card ─────────────────────────────────────────────── */}
      <Card className="flex flex-col transition-shadow duration-200 hover:shadow-md hover:border-zinc-700 overflow-hidden border-zinc-850">
        {/* Product Image */}
        <div className="h-48 w-full bg-zinc-900 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl || `https://picsum.photos/seed/${product.id}/400/300`}
            alt={product.name}
            className="absolute inset-0 h-full w-full object-cover opacity-90 hover:opacity-100 transition-opacity"
            loading="lazy"
          />
        </div>

        <CardHeader className="space-y-3 pt-4">
          {/* Name + stock badge */}
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base leading-snug text-zinc-100">{product.name}</CardTitle>
            {!noWarehouseSelected && (
              <StockBadge
                total={warehouseStock!.total}
                reserved={warehouseStock!.reserved}
              />
            )}
          </div>

          {/* Price */}
          <div className="text-2xl font-extrabold tracking-tight text-zinc-100">
            ${product.price.toFixed(2)}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col flex-1 gap-4">
          {/* Description */}
          <p className="text-sm leading-relaxed text-zinc-400 flex-1">
            {product.description ?? 'No description available.'}
          </p>

          {/* Stock breakdown — only when a warehouse is selected */}
          {warehouseStock && (
            <div className="rounded-lg border border-zinc-850 bg-zinc-900/30 px-4 py-3">
              <dl className="grid grid-cols-3 gap-2 text-sm">
                {[
                  { label: 'Total', value: warehouseStock.total },
                  { label: 'Reserved', value: warehouseStock.reserved },
                  { label: 'Available', value: warehouseStock.available },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <dt className="text-zinc-500 text-xs">{label}</dt>
                    <dd className="font-semibold text-zinc-100">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Reserve button */}
          <Button
            id={`reserve-${product.id}`}
            className="w-full"
            disabled={isOutOfStock || noWarehouseSelected || isReserving}
            onClick={handleReserveClick}
            aria-label={
              noWarehouseSelected
                ? 'Select a warehouse to reserve'
                : isOutOfStock
                  ? `${product.name} is out of stock`
                  : `Reserve ${product.name}`
            }
          >
            {isReserving
              ? 'Reserving…'
              : noWarehouseSelected
                ? 'Select a warehouse'
                : isOutOfStock
                  ? 'Out of Stock'
                  : 'Reserve'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Confirmation Modal — portalled to <body> so it escapes overflow:hidden ── */}
      {showConfirm && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false) }}
        >
          <div
            className="relative w-full max-w-md bg-zinc-950 rounded-2xl shadow-2xl shadow-black/60 border border-zinc-800 overflow-hidden flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reserve-modal-title"
          >
            {/* Accent top bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />

            {/* Close button */}
            <button
              onClick={() => setShowConfirm(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 p-1.5 rounded-full transition-colors cursor-pointer z-10"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-6 space-y-6">
              {/* Title */}
              <div className="space-y-1">
                <h3 id="reserve-modal-title" className="text-xl font-bold text-zinc-100">
                  Confirm Reservation
                </h3>
                <p className="text-sm text-zinc-400">
                  Please review and confirm your inventory reservation.
                </p>
              </div>

              {/* Product info */}
              <div className="flex gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/30">
                <div className="h-16 w-16 bg-zinc-900 rounded-lg relative overflow-hidden flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.imageUrl || `https://picsum.photos/seed/${product.id}/150/150`}
                    alt={product.name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-zinc-100 truncate">{product.name}</h4>
                  <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                    {product.description ?? 'No description'}
                  </p>
                  <p className="text-base font-extrabold text-blue-400 mt-1">
                    ${product.price.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Warehouse selector */}
              <div className="space-y-2">
                <label
                  htmlFor="modal-warehouse-select"
                  className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider"
                >
                  Select Warehouse
                </label>
                <select
                  id="modal-warehouse-select"
                  value={confirmWarehouseId}
                  onChange={(e) => handleWarehouseChange(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 font-medium focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {availableWarehouses.map((w) => (
                    <option key={w.warehouseId} value={w.warehouseId} className="bg-zinc-950 text-zinc-100">
                      {w.name} {w.location ? `(${w.location})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity slider */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="modal-quantity-slider"
                    className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider"
                  >
                    Select Quantity
                  </label>
                  <span className="text-sm font-bold text-blue-400 bg-blue-950/20 border border-blue-900/30 px-2.5 py-0.5 rounded-full">
                    {quantity} {quantity === 1 ? 'unit' : 'units'}
                  </span>
                </div>
                <input
                  id="modal-quantity-slider"
                  type="range"
                  min="1"
                  max={maxQuantity || 1}
                  value={quantity}
                  disabled={maxQuantity <= 0}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <span>1 unit</span>
                  <span>Max ({maxQuantity} available)</span>
                </div>
              </div>

              {/* Live stock breakdown */}
              {selectedConfirmStock && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/20 p-4 space-y-3">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                    Current Stock Status
                  </span>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-2">
                      <div className="text-xs text-zinc-400 font-medium">Total</div>
                      <div className="text-sm font-bold text-zinc-100 mt-0.5">
                        {selectedConfirmStock.total}
                      </div>
                    </div>
                    <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-2">
                      <div className="text-xs text-zinc-400 font-medium">Reserved</div>
                      <div className="text-sm font-bold text-zinc-100 mt-0.5">
                        {selectedConfirmStock.reserved}
                      </div>
                    </div>
                    <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-2">
                      <div className="text-xs text-zinc-400 font-medium">Available</div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          selectedConfirmStock.available > 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {selectedConfirmStock.available}
                      </div>
                    </div>
                  </div>

                  {selectedConfirmStock.available <= 0 ? (
                    <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-950/20 border border-rose-900/30 rounded-lg p-2.5">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>This warehouse is currently out of stock for this product.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-2.5">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      <span>Inventory is available for immediate reservation checkout.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedConfirmStock || selectedConfirmStock.available <= 0 || isReserving}
                  onClick={handleConfirmReserve}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isReserving ? 'Reserving...' : 'Confirm Reservation'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/** Skeleton for a product card while loading */
export function ProductCardSkeleton() {
  return (
    <Card className="animate-pulse border-zinc-850" aria-hidden="true">
      <CardHeader className="space-y-4">
        <div className="flex justify-between gap-4">
          <div className="h-5 w-2/3 rounded bg-zinc-800/80" />
          <div className="h-5 w-16 rounded-full bg-zinc-800/80" />
        </div>
        <div className="h-8 w-24 rounded bg-zinc-800/80" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-zinc-800/80" />
          <div className="h-4 w-5/6 rounded bg-zinc-800/80" />
        </div>
        <div className="h-16 rounded bg-zinc-800/80" />
        <div className="h-9 w-full rounded bg-zinc-800/80" />
      </CardContent>
    </Card>
  )
}
