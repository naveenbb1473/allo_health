'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCountdown } from '@/lib/hooks/useCountdown'

interface ReservationItem {
  id: string
  productId: string
  warehouseId: string
  quantity: number
  product: {
    id: string
    name: string
    description: string | null
    price: number
  }
  warehouse: {
    id: string
    name: string
    location: string
  }
}

interface ReservationResponse {
  id: string
  customerId: string
  status: 'pending' | 'confirmed' | 'released'
  createdAt: string
  updatedAt: string
  expiresAt: string
  confirmedAt: string | null
  releasedAt: string | null
  expiresInSeconds: number
  isExpired: boolean
  items: ReservationItem[]
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="animate-pulse">
        <CardContent className="space-y-6 pt-6">
          <div className="h-10 w-64 rounded bg-slate-200" />
          <div className="h-32 rounded bg-slate-200" />
          <div className="h-32 rounded bg-slate-200" />
          <div className="h-12 rounded bg-slate-200" />
        </CardContent>
      </Card>
    </div>
  )
}

function CheckoutContent({
  reservation,
  onConfirm,
  onCancel,
  actionLoading,
}: {
  reservation: ReservationResponse
  onConfirm: () => Promise<void>
  onCancel: () => Promise<void>
  actionLoading: boolean
}) {
  const { minutes, seconds, isExpired, isWarning } = useCountdown(reservation.expiresAt)
  
  // Calculate total price
  const totalPrice = useMemo(() => {
    return reservation.items.reduce(
      (sum, item) => sum + item.quantity * item.product.price,
      0,
    )
  }, [reservation])

  useEffect(() => {
    if (isExpired) {
      toast.error('Reservation expired', { id: 'expiry-toast' })
    }
  }, [isExpired])

  const formatCountdown = () => {
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">
          Confirm Reservation
        </h1>
        <p className="text-slate-600">
          Review your reserved inventory before confirmation.
        </p>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-2xl">
              Reservation Summary
            </CardTitle>

            <Badge
              className={
                isExpired
                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                  : isWarning
                  ? 'bg-red-100 text-red-700 border-red-200 animate-pulse'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-200'
              }
            >
              {isExpired ? 'Expired' : `${formatCountdown()} remaining`}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {reservation.items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {item.product.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.product.description}
                    </p>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Warehouse:</span>{' '}
                      {item.warehouse.name}
                    </div>
                    <div className="text-slate-500">
                      {item.warehouse.location}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-right">
                  <div className="text-lg font-semibold">
                    ${item.product.price.toFixed(2)}
                  </div>
                  <div className="text-sm text-slate-600">
                    Qty: {item.quantity}
                  </div>
                  <div className="font-medium">
                    ${(item.quantity * item.product.price).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between border-t pt-6">
            <div className="text-lg font-medium">Total</div>
            <div className="text-3xl font-bold">
              ${totalPrice.toFixed(2)}
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4 md:flex-row">
            <Button
              className="flex-1"
              disabled={actionLoading || isExpired}
              onClick={() => void onConfirm()}
            >
              {actionLoading
                ? 'Processing...'
                : isExpired
                ? 'Expired'
                : 'Confirm Reservation'}
            </Button>

            <Button
              variant="outline"
              className="flex-1"
              disabled={actionLoading}
              onClick={() => void onCancel()}
            >
              Cancel Reservation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { ApiError, useApi } from '@/lib/hooks/useApi'
import { ErrorDisplay } from '@/components/error/ErrorDisplay'

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const reservationId = params.id as string

  const { data: reservation, loading, error, setError } = useApi<ReservationResponse>(
    `/api/reservations/${reservationId}`
  )
  const [actionLoading, setActionLoading] = useState(false)

  // Use useEffect to catch 'already processed' which is technically not an HTTP error code in the GET response
  useEffect(() => {
    if (reservation && reservation.status !== 'pending') {
      setError(new ApiError('Reservation already processed', 400))
    }
  }, [reservation, setError])

  async function handleConfirm() {
    if (!reservation) return

    try {
      setActionLoading(true)
      const response = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: 'POST',
      })

      if (response.status === 410) {
        toast.error('Reservation expired')
        setError(new ApiError('Reservation expired, returned to inventory', 410))
        return
      }

      if (response.status === 400) {
        toast.error('Reservation already processed')
        setError(new ApiError('Reservation already processed', 400))
        return
      }

      if (!response.ok) {
        throw new Error('Failed to confirm reservation')
      }

      toast.success('Reservation confirmed successfully')
      setTimeout(() => {
        router.push('/products')
      }, 2000)
    } catch (err) {
      console.error(err)
      toast.error('Failed to confirm reservation')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancel() {
    if (!reservation) return

    try {
      setActionLoading(true)
      const response = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to cancel reservation')
      }

      toast.success('Reservation cancelled')
      setTimeout(() => {
        router.push('/products')
      }, 1500)
    } catch (err) {
      console.error(err)
      toast.error('Failed to cancel reservation')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10">
        <CheckoutSkeleton />
      </main>
    )
  }

  if (error || (reservation && reservation.status !== 'pending')) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-6 pt-6 text-center text-left">
            <ErrorDisplay error={error} />
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => router.push('/products')}>
                Back to Products
              </Button>
              <Button onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!reservation) return null

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <CheckoutContent
        reservation={reservation}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        actionLoading={actionLoading}
      />
    </main>
  )
}
