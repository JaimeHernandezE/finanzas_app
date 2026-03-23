import { useApi } from './useApi'
import { catalogosApi } from '../api/catalogos'

export function useCategorias() {
  return useApi(() => catalogosApi.getCategorias())
}

export function useMetodosPago() {
  return useApi(() => catalogosApi.getMetodosPago())
}

export function useTarjetas() {
  return useApi(() => catalogosApi.getTarjetas())
}
