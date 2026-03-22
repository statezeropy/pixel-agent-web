import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { SpriteTestPage } from './SpriteTestPage.js'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpriteTestPage />
  </StrictMode>,
)
