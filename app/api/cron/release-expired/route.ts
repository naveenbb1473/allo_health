import { NextRequest, NextResponse } from 'next/server'
import { ExpiryService } from '@/services/expiry.service'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    logger.warn('Unauthorized cron invocation attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checkInId = Sentry.captureCheckIn({
    monitorSlug: 'new-monitor',
    status: 'in_progress',
  });

  try {
    const result = await ExpiryService.releaseExpiredReservations()
    
    // Log to Winston
    logger.info(`Released ${result.released} expired reservations`, {
      processed: result.processed,
      failed: result.failed
    })

    // Send successful check-in to Sentry
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'new-monitor',
      status: 'ok',
    });
    
    return NextResponse.json({ 
      success: true, 
      processed: result.processed,
      released: result.released,
      failed: result.failed
    })
  } catch (error) {
    logger.error('CRON Fatal Error', { error })
    
    // Send failed check-in to Sentry
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'new-monitor',
      status: 'error',
    });
    Sentry.captureException(error)

    return NextResponse.json(
      { error: 'Failed to release expired' },
      { status: 500 }
    )
  }
}
