import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './fonts.css'
import App from './App.tsx'
import SuccessToastProvider from './components/SuccessToastProvider'
import './theme.css'
import './appearance.css'
import './components/landing-redesign.css'
import './components/dashboard-refresh.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SuccessToastProvider><App /></SuccessToastProvider>
  </StrictMode>,
)
