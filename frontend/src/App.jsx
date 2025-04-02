import React, { useContext } from 'react';
import { AuthContext } from './context/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard'; // Importa o componente real

function App() {
  const { isAuthenticated, loadingAuth } = useContext(AuthContext);

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center"><span className="loading loading-lg loading-spinner text-primary"></span></div>; // Ou um spinner/skeleton melhor
  }

  return isAuthenticated ? <Dashboard /> : <Login />; // Usa o Dashboard real
}

export default App
