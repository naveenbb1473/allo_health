import { useState, useEffect } from 'react'

export class ApiError extends Error {
  code: number
  available?: number

  constructor(message: string, code: number, available?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.available = available
  }
}

export function useApi<T>(url: string, options?: RequestInit) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const response = await fetch(url, options)
        
        if (!response.ok) {
          let errorData
          try {
            errorData = await response.json()
          } catch {
            errorData = { message: response.statusText }
          }
          
          throw new ApiError(
            errorData.error || errorData.message || 'API Error',
            response.status,
            errorData.available
          )
        }
        
        const json = await response.json()
        setData(json)
      } catch (err) {
        setError(err as ApiError)
      } finally {
        setLoading(false)
      }
    }
    
    if (url) {
      void fetchData()
    }
  }, [url, options]) // Assuming options is memoized or stable

  return { data, loading, error, setError }
}
