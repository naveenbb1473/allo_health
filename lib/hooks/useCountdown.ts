import { useState, useEffect } from 'react'

export function useCountdown(expiresAt: Date | string) {
  const [timeRemaining, setTimeRemaining] = useState(() => {
    const expiry = new Date(expiresAt).getTime()
    const now = new Date().getTime()
    const remaining = expiry - now
    return remaining > 0 ? Math.floor(remaining / 1000) : 0
  })
  
  const [isExpired, setIsExpired] = useState(() => {
    const expiry = new Date(expiresAt).getTime()
    return expiry <= new Date().getTime()
  })

  useEffect(() => {
    const expiryTime = new Date(expiresAt).getTime()

    const updateTimer = () => {
      const now = new Date().getTime()
      const remaining = expiryTime - now
      
      if (remaining <= 0) {
        setIsExpired(true)
        setTimeRemaining(0)
        return true // expired
      } else {
        setTimeRemaining(Math.floor(remaining / 1000))
        return false // not expired
      }
    }

    // Check immediately in case it expired between render and mount
    if (updateTimer()) return

    const interval = setInterval(() => {
      if (updateTimer()) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [expiresAt])

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  return {
    minutes,
    seconds,
    isExpired,
    isWarning: timeRemaining < 120, // < 2 minutes
    timeRemaining,
  }
}
