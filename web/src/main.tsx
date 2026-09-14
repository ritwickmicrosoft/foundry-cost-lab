import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { WorkspaceAccessGate } from './components/WorkspaceAccessGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WorkspaceAccessGate><App /></WorkspaceAccessGate>
    </ErrorBoundary>
  </StrictMode>,
)
