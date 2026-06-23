import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Capture viewport height before any keyboard opens.
// iOS Safari shrinks window.innerHeight when keyboard appears; locking --app-height
// to the initial value keeps the layout stable and lets main content scroll instead.
const setAppHeight = () => {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
}
setAppHeight()
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 300))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
