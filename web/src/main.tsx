import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './lib/theme'
import { AmountVisibilityProvider } from './lib/amountVisibility'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AmountVisibilityProvider>
        <App />
      </AmountVisibilityProvider>
    </ThemeProvider>
  </StrictMode>,
)
