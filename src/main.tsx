import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ArtemisProvider } from './state/AppState.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArtemisProvider>
      <App />
    </ArtemisProvider>
  </StrictMode>,
)
