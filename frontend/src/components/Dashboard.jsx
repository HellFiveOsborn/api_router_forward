// frontend/src/components/Dashboard.jsx
import React, { useContext, useState, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import ForwardList from './ForwardList'; // Criaremos a seguir
import AddForwardModal from './AddForwardModal'; // Para adicionar/editar
import { FaPlus } from 'react-icons/fa'; // Ícone para botão Adicionar

function Dashboard() {
  const auth = useContext(AuthContext);

   if (!auth) {
    // Isso não deve acontecer se estiver dentro do AuthProvider, mas é uma guarda
    return <div>Erro: Contexto de autenticação não encontrado no Dashboard.</div>;
  }
   const { logout } = auth;

  // Estado para controlar modal de adição/edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingForward, setEditingForward] = useState(null); // Guarda dados do forward para edição
  const [keyForList, setKeyForList] = useState(0); // Chave para forçar re-render da lista

  // Força a re-renderização da lista (e consequentemente a busca de dados)
  // Uma abordagem melhor seria usar uma lib de state management ou passar a função fetch para o modal
  const refreshList = useCallback(() => {
      setKeyForList(prevKey => prevKey + 1); // Altera a chave para forçar re-render do ForwardList
      console.log("Tentando atualizar a lista...");
  }, []);

  const handleOpenAddModal = () => {
    setEditingForward(null); // Garante que não está editando
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (forward) => {
    setEditingForward(forward); // Define os dados para edição
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingForward(null); // Limpa os dados de edição ao fechar
  };

  // Chamado pelo modal após salvar com sucesso
  const handleSaveForward = (savedForward, isEdit) => {
      console.log(`Forward ${isEdit ? 'atualizado' : 'criado'}:`, savedForward);
      refreshList(); // Atualiza a lista no Dashboard
      // O modal já chama onClose internamente
  };


  return (
    <div className="min-h-screen bg-base-200 p-4 flex flex-col">
      {/* Navbar */}
      <div className="navbar bg-base-100 rounded-box shadow-lg mb-6">
        <div className="flex-1">
          <a className="btn btn-ghost text-xl">Route Forward Dashboard</a>
        </div>
        <div className="flex-none gap-2">
          {/* Botão Adicionar Novo */}
          <button className="btn btn-primary" onClick={handleOpenAddModal}>
             <FaPlus className="mr-1" /> Adicionar Forward
          </button>
          <button className="btn btn-outline btn-error" onClick={logout}>Logout</button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      {/* Usamos a chave 'keyForList' para forçar o ForwardList a remontar e buscar dados novamente */}
      <main className="container mx-auto flex-grow" key={keyForList}>
         <h1 className="text-3xl font-bold mb-6 text-center md:text-left">Encaminhadores Configurados</h1>
         {/* Componente da lista de Forwards */}
         <ForwardList onEdit={handleOpenEditModal} onAdd={handleOpenAddModal} /> {/* Passa onEdit e onAdd */}
      </main>

       {/* Footer simples */}
       <footer className="footer footer-center p-4 bg-base-300 text-base-content mt-10 rounded-box">
            <aside>
                <p>Route Forward - Gerenciador de Encaminhamento de API</p>
            </aside>
        </footer>

        {/* Modal para Adicionar/Editar */}
        <AddForwardModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            forwardData={editingForward} // Passa null para adicionar, ou os dados para editar
            onSave={handleSaveForward} // Passa a função para atualizar a lista
        />
    </div>
  );
}

export default Dashboard;