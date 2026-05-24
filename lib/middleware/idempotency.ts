import { Redis } from '@upstash/redis'

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

const IDEMPOTENCY_TTL_SECONDS = 3600 // 1 hour

/**
 * Checks Redis for a cached response for a given idempotency key.
 * Returns the cached body+status if found, null otherwise.
 */
export async function getCachedIdempotentResponse(
  key: string,
): Promise<{ body: unknown; status: number } | null> {
  if (!redis) return null

  try {
    const cached = await redis.get<{ body: unknown; status: number }>(
      `idempotency:${key}`,
    )
    return cached ?? null
  } catch {
    // Redis unavailable — degrade gracefully, don't block the request
    return null
  }
}

/**
 * Caches a response body+status under the given idempotency key.
 * Silently swallows Redis errors so a cache miss never fails the request.
 */
export async function cacheIdempotentResponse(
  key: string,
  body: unknown,
  status: number,
): Promise<void> {
  if (!redis) return

  try {
    await redis.set(`idempotency:${key}`, { body, status }, { ex: IDEMPOTENCY_TTL_SECONDS })
  } catch {
    // Best-effort — failure here is non-fatal
  }
}
