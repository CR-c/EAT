import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { getPlatformContext } from './lib/platform'

const platform = getPlatformContext()
document.documentElement.dataset.platformKind = platform.kind
document.documentElement.dataset.platformShell = platform.shell ?? 'web'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
