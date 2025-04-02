import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css' // Importa o CSS principal configurado
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx' // Importa o AuthProvider

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Envolve o App com o AuthProvider */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
