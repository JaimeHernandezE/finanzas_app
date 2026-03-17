import { useState, useEffect, useCallback, useRef } from 'react'

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useApi<T>(
  fetcher: () => Promise<{ data: T }>,
  deps: unknown[] = [],
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetcherRef.current()
      setData(res.data)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } }; message?: string }
      setError(
        ax.response?.data?.error ??
          ax.message ??
          'Error al cargar los datos.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps controlan cuándo refetch; fetcher se lee por ref
  }, [fetch, ...deps])

  return { data, loading, error, refetch: fetch }
}
