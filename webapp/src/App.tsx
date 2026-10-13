import { BrowserRouter } from 'react-router-dom'
import { AlertsProvider } from './components/alerts/AlertsProvider'
import { AppRouter } from './layout/AppRouter'

function App() {
  return (
    <AlertsProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AlertsProvider>
  )
}

export default App
