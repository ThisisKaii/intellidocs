import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initOpenReplay } from './services/openreplay'
import './styles/documentFonts.css'
import './styles/index.css'

// Opt-in research telemetry: only starts when the build carries
// VITE_ENABLE_RESEARCH_TELEMETRY=true and a valid OpenReplay key.
void initOpenReplay()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="min-h-screen w-full max-w-full overflow-x-hidden">
      <App />
    </div>
  </React.StrictMode>,
)