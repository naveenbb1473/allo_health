import { Badge } from '@/components/ui/badge'

interface StockBadgeProps {
  total: number
  reserved: number
  /** Optional override — highlight as low even if not strictly low */
  lowThreshold?: number
}

export function StockBadge({ total, reserved, lowThreshold = 5 }: StockBadgeProps) {
  const available = total - reserved

  if (available <= 0) {
    return (
      <Badge variant="danger" aria-label="Out of stock">
        Out of Stock
      </Badge>
    )
  }

  if (available <= lowThreshold) {
    return (
      <Badge variant="warning" aria-label={`Low stock: ${available} available`}>
        Low Stock · {available}
      </Badge>
    )
  }

  if (reserved > 0) {
    return (
      <Badge variant="info" aria-label={`${available} available, ${reserved} reserved`}>
        {available} available
      </Badge>
    )
  }

  return (
    <Badge variant="success" aria-label={`${available} in stock`}>
      In Stock · {available}
    </Badge>
  )
}
