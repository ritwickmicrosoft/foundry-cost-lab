import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Foundry Cost Lab rendering failure', error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-fallback">
          <AlertTriangle aria-hidden="true" />
          <h1>The workspace could not render</h1>
          <p>Your saved browser scenarios have not been changed.</p>
          <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
            <RotateCcw aria-hidden="true" />
            Reload workspace
          </button>
        </main>
      )
    }

    return this.props.children
  }
}