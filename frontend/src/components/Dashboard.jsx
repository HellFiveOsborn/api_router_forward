// frontend/src/components/Dashboard.jsx
import React, { useContext, useState, useCallback, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import ForwardList from './ForwardList';
import AddForwardModal from './AddForwardModal';
import { getForwards } from '../services/api';
import { FaPlus, FaFlask } from 'react-icons/fa';
import { FiUser, FiSun, FiMoon, FiLogOut } from 'react-icons/fi';
import { Sparkles, LayoutDashboard } from 'lucide-react';

function Dashboard({ navigateTo }) {
  const auth = useContext(AuthContext);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [forwards, setForwards] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Busca os forwards
  useEffect(() => {
    const fetchForwards = async () => {
      try {
        const data = await getForwards();
        setForwards(data || []);
      } catch (err) {
        console.error('Erro ao buscar forwards:', err);
      }
    };
    fetchForwards();
  }, []);

  if (!auth) {
    return <div className="min-h-screen grid place-items-center bg-base-200">Erro: Contexto de autenticação não encontrado no Dashboard.</div>;
  }
  const { logout } = auth;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForward, setEditingForward] = useState(null);
  const [keyForList, setKeyForList] = useState(0);

  const refreshList = useCallback(async () => {
    setKeyForList(prevKey => prevKey + 1);
    console.log("Tentando atualizar a lista...");
    // Atualiza as estatísticas também
    try {
      const data = await getForwards();
      setForwards(data || []);
    } catch (err) {
      console.error('Erro ao atualizar forwards:', err);
    }
  }, []);

  const handleOpenAddModal = () => {
    setEditingForward(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (forward) => {
    setEditingForward(forward);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingForward(null);
  };

  const handleSaveForward = (savedForward, isEdit) => {
    console.log(`Forward ${isEdit ? 'atualizado' : 'criado'}:`, savedForward);
    refreshList();
  };

  // Simula usuário logado (poderia vir do contexto futuramente)
  const userName = "admin";

  // Calcula estatísticas
  const totalForwards = forwards.length;
  const activeForwards = forwards.length; // Todos são considerados ativos

  // Conta métodos únicos
  const uniqueMethods = new Set();
  forwards.forEach(fwd => {
    if (Array.isArray(fwd.metodo)) {
      fwd.metodo.forEach(m => uniqueMethods.add(m));
    } else if (fwd.metodo) {
      uniqueMethods.add(fwd.metodo);
    }
  });
  const totalMethods = uniqueMethods.size;

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200 p-0 flex flex-col">
      {/* Navbar moderna com glassmorphism */}
      <div className="navbar glass-effect shadow-xl px-4 md:px-8 sticky top-0 z-20 border-b border-base-300 animate-slide-down">
        <div className="flex-1 gap-3">
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight flex items-center gap-2">
              Route Forward
            </span>
            <span className="text-xs opacity-60 hidden sm:block">Gerenciamento de Rotas</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-primary btn-sm hidden md:flex gap-2 hover-lift shadow-md" onClick={handleOpenAddModal}>
            <FaPlus /> <span>Adicionar Forward</span>
          </button>
          <button className="btn btn-accent btn-outline btn-sm gap-2 hover-lift" onClick={() => navigateTo('playground')}>
            <FaFlask /> <span className="hidden sm:inline">Playground</span>
          </button>

          {/* Dropdown de temas */}
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-sm gap-2">
              {theme === 'light' ? <FiSun className="text-warning" /> : <FiMoon className="text-info" />}
              <span className="hidden lg:inline">Tema</span>
            </label>
            <ul tabIndex={0} className="dropdown-content z-[1] p-2 shadow-2xl bg-base-100 rounded-box w-52 max-h-96 overflow-y-auto">
              {['light', 'dark', 'cupcake', 'cyberpunk', 'valentine', 'aqua', 'synthwave', 'retro', 'forest', 'luxury', 'dracula', 'night'].map((t) => (
                <li key={t}>
                  <button
                    className={`btn btn-sm btn-ghost w-full justify-start ${theme === t ? 'btn-active' : ''}`}
                    onClick={() => setTheme(t)}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Usuário logado */}
          <div className="flex items-center gap-2 px-3 py-1 bg-base-200 rounded-full">
            <FiUser className="opacity-70" />
            <span className="text-sm font-medium hidden sm:inline">{userName}</span>
          </div>
          <button className="btn btn-outline btn-error btn-sm gap-2 hover-lift" onClick={logout}>
            <FiLogOut /> <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="container mx-auto flex-grow px-4 md:px-6 py-8 animate-fade-in" key={keyForList}>
        {/* Header com estatísticas */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
                <LayoutDashboard className="w-8 h-8 text-primary" />
                Dashboard
              </h1>
              <p className="text-sm opacity-70 mt-1">Gerencie seus encaminhadores de API</p>
            </div>
            <button className="btn btn-primary md:hidden w-full gap-2 shadow-lg hover-lift" onClick={handleOpenAddModal}>
              <FaPlus /> Novo Forward
            </button>
          </div>

          {/* Cards de estatísticas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="card bg-base-100 shadow-lg hover-lift border border-base-300">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-70">Total de Forwards</p>
                    <p className="text-3xl font-bold text-primary">{totalForwards}</p>
                  </div>
                  <div className="bg-primary/10 p-3 rounded-full">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-lg hover-lift border border-base-300">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-70">Ativos</p>
                    <p className="text-3xl font-bold text-success">{activeForwards}</p>
                  </div>
                  <div className="bg-success/10 p-3 rounded-full">
                    <div className="w-3 h-3 bg-success rounded-full animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-lg hover-lift border border-base-300">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-70">Métodos Únicos</p>
                    <p className="text-3xl font-bold text-secondary">{totalMethods}</p>
                  </div>
                  <div className="bg-secondary/10 p-3 rounded-full">
                    <FaFlask className="w-6 h-6 text-secondary" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ForwardList onEdit={handleOpenEditModal} onAdd={handleOpenAddModal} />
      </main>

      {/* Footer moderno */}
      <footer className="footer footer-center p-4 bg-base-300/50 backdrop-blur-sm text-base-content border-t border-base-300">
        <aside className="animate-fade-in">
          <p className="text-sm">
            <span className="font-semibold">Route Forward</span> &copy; {new Date().getFullYear()} —
            <span className="opacity-70"> Gerenciador de Encaminhamento de API</span>
          </p>
        </aside>
      </footer>

      {/* Modal para Adicionar/Editar */}
      <AddForwardModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        forwardData={editingForward}
        onSave={handleSaveForward}
      />
    </div>
  );
}

export default Dashboard;