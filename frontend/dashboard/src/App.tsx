import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { Button } from './shared/components/ui/button'
import { Input } from './shared/components/ui/input'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Global error handler
window.onerror = (message, source, lineno, colno, error) => {
  console.error('Global error:', { message, source, lineno, colno, error });
  toast.error('An unexpected error occurred. Please try again.');
};

// Unhandled promise rejection handler
window.onunhandledrejection = (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  toast.error('Failed to complete operation. Please try again.');
};

function App() {
  const [count, setCount] = useState(0)

  return (
    <ErrorBoundary>
      <ToastContainer position="top-right" />
      <div className="main-content">
        <div>
          <a href="https://vite.dev" target="_blank" rel="noopener noreferrer">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>
        <h1>SpaceWH AI Platform</h1>
        <div className="card space-y-4">
          <Button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </Button>
          <Input placeholder="Type here..." />
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default App
