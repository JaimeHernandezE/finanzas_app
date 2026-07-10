import { useState, useEffect, useCallback, useRef } from 'react'
import { apiErrorMessage } from '../api/apiErrorMessage'

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
  const requestSeqRef = useRef(0)

  const fetch = useCallback(async () => {
    const seq = ++requestSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetcherRef.current()
      if (requestSeqRef.current !== seq) return
      setData(res.data)
    } catch (err: unknown) {
      if (requestSeqRef.current !== seq) return
      setError(apiErrorMessage(err) || 'Error al cargar los datos.')
    } finally {
      if (requestSeqRef.current !== seq) return
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps controlan cuándo refetch; fetcher se lee por ref
  }, [fetch, ...deps])

  return { data, loading, error, refetch: fetch }
}
