import { createPinia, setActivePinia } from 'pinia'

export function setupPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}
