import { Badge } from '@/components/ui/badge'
import { ReservationStatus } from '@prisma/client'

interface ReservationStatusChipProps {
  status: ReservationStatus
}

const config: Record<ReservationStatus, { label: string; variant: 'warning' | 'success' | 'default' }> = {
  pending:   { label: 'Pending',   variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  released:  { label: 'Released',  variant: 'default' },
}

export function ReservationStatusChip({ status }: ReservationStatusChipProps) {
  const { label, variant } = config[status]
  return (
    <Badge variant={variant} aria-label={`Reservation status: ${label}`}>
      {label}
    </Badge>
  )
}
