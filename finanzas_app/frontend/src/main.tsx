import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initUmamiIfDemo } from '@/analytics/umami'
import '@/styles/main.scss'
import './i18n'
import App from './App'

initUmamiIfDemo()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
