import React, { useContext, useState } from 'react'; // Adiciona useState
import { AuthContext } from './context/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Playground from './components/Playground'; // Importa o novo componente

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard'); // 'dashboard' ou 'playground'
  const { isAuthenticated, loadingAuth } = useContext(AuthContext);

  if (loadingAuth) {
    return <div className="min-h-screen flex items-center justify-center"><span className="loading loading-lg loading-spinner text-primary"></span></div>; // Ou um spinner/skeleton melhor
  }

  // Passa a função para mudar de página para os componentes filhos
  const navigateTo = (page) => setCurrentPage(page);

  if (!isAuthenticated) {
    return <Login />;
  }

  // Renderiza a página atual se autenticado
  return (
    <>
      {currentPage === 'dashboard' && <Dashboard navigateTo={navigateTo} />}
      {currentPage === 'playground' && <Playground navigateTo={navigateTo} />}
    </>
  );
}

export default App
