// frontend/src/components/ForwardList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getForwards, deleteForward, exportForwardConfig } from '../services/api'; // Importa funções da API
import { FaEdit, FaTrashAlt, FaExternalLinkAlt, FaPlus, FaFileExport } from 'react-icons/fa'; // Ícones

// Função auxiliar para derivar path padrão da URL (adaptada do backend)
function getDefaultPathFromUrl(urlString) {
    try {
        // No frontend, podemos precisar de um polyfill ou tratamento diferente para URL se o suporte for antigo
        // Usamos uma base dummy se a URL for relativa, mas idealmente deveria ser absoluta
        const base = urlString.startsWith('/') ? window.location.origin : undefined;
        const parsedUrl = new URL(urlString, base);
        const pathname = parsedUrl.pathname || '/';
        return pathname === '/' ? '/' : pathname.replace(/\/$/, ''); // Remove barra final se não for raiz
    } catch (e) {
        return '/'; // Retorna raiz como fallback
    }
}

// Props esperadas: onEdit (função para abrir modal de edição), onAdd (função para abrir modal de adição)
function ForwardList({ onEdit, onAdd }) {
  const [forwards, setForwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchForwards = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getForwards();
      setForwards(data || []); // Garante que seja um array
    } catch (err) {
      // Verifica se é um erro de autenticação (401 ou 403)
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        // Não define o erro local, permite que o AuthContext/App lide com o redirecionamento
      } else {
        // Para outros erros, define a mensagem de erro local
        setError(err.message || "Falha ao carregar a lista de forwards.");
      }
      // Se o erro for 401/403, o apiFetch já limpou o token,
      // o AuthContext deve detectar a mudança e redirecionar para Login via App.jsx
    } finally {
      setLoading(false);
    }
  }, []); // useCallback para evitar recriação desnecessária

  useEffect(() => {
    fetchForwards();
  }, [fetchForwards]); // Executa ao montar

  const handleEditClick = (forward) => {
    if (onEdit) onEdit(forward);
    // else console.warn("Função onEdit não fornecida para ForwardList"); // Log removido
  };

  const handleDeleteClick = async (forward) => {
     if (window.confirm(`Tem certeza que deseja deletar o forward "${forward.nome}" (ID: ${forward.id})? Esta ação não pode ser desfeita.`)) {
        try {
            setLoading(true); // Pode ser um loading específico para a linha
            await deleteForward(forward.id);
            // Atualiza a lista removendo o item deletado
            setForwards(prevForwards => prevForwards.filter(f => f.id !== forward.id));
            // Opcional: Exibir notificação de sucesso
        } catch (err) {
            setError(`Falha ao deletar o forward "${forward.nome}": ${err.message}`);
            // Opcional: Exibir notificação de erro
        } finally {
             setLoading(false); // Desativa loading geral ou da linha
        }
     }
  };

 // Função para lidar com a exportação de configuração de um forward específico
 const handleExportClick = async (id) => {
   try {
     setLoading(true);
     await exportForwardConfig(id);
     // Não é necessário atualizar o estado, pois a exportação não altera os dados
   } catch (err) {
     setError(`Falha ao exportar configuração: ${err.message}`);
   } finally {
     setLoading(false);
   }
 };

  if (loading && forwards.length === 0) { // Mostra loading principal apenas na carga inicial
    return <div className="flex justify-center items-center p-10"><span className="loading loading-lg loading-dots text-primary"></span></div>;
  }

  // Mostra erro apenas se não houver dados e houver erro
  if (error && forwards.length === 0) {
    return (
        <div role="alert" className="alert alert-error shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
                <h3 className="font-bold">Erro ao carregar forwards!</h3>
                <div className="text-xs">{error}</div>
            </div>
             <button className="btn btn-sm btn-ghost" onClick={fetchForwards}>Tentar Novamente</button>
        </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-base-100 rounded-box shadow-md relative">
       {/* Mostra erro mesmo se houver dados (ex: erro ao deletar) */}
       {error && forwards.length > 0 && (
           <div role="alert" className="alert alert-warning shadow-lg absolute top-2 right-2 w-auto z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span>{error}</span>
                <button className="btn btn-xs btn-ghost" onClick={() => setError('')}>Fechar</button>
           </div>
       )}

      {forwards.length === 0 && !loading ? (
         <div className="p-10 text-center text-gray-500">
            <p className="mb-4">Nenhum encaminhador configurado ainda.</p>
            <button className="btn btn-primary btn-sm" onClick={onAdd}>
                <FaPlus className="mr-1"/> Criar Primeiro Forward
            </button>
         </div>
      ) : (
        <>
          <table className="table table-zebra w-full">
            {/* head */}
            <thead>
              <tr>
                <th>Nome</th>
                <th>Rota do Sistema</th>
                <th>URL de Destino</th>
                <th>Método</th>
                <th>Última Modificação</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {forwards.map((fwd) => (
                // O erro de hidratação original era provavelmente devido a espaços/comentários
                // entre o `<tbody>` e o primeiro `<tr>` ou entre `map` e `<tr>`.
                // Garantindo que o map retorne diretamente o tr.
                <React.Fragment key={fwd.id}>
                  <tr className={`hover ${loading && 'opacity-50'}`}>
                  <td className="font-medium">{fwd.nome}</td>
                  <td>
                      {/* Exibe a rota completa do sistema */}
                      <code className="bg-base-300 px-1 rounded text-sm">
                          /{fwd.slug}{fwd.custom_route ? fwd.custom_route.replace(/\/$/, '') : getDefaultPathFromUrl(fwd.url_destino)}
                          {/* Adiciona /* para indicar que captura sub-rotas, exceto se for a raiz */}
                          {(fwd.custom_route || getDefaultPathFromUrl(fwd.url_destino)) !== '/' ? '/*' : '*'}
                      </code>
                  </td>
                  <td className="max-w-xs truncate" title={fwd.url_destino}>
                      <a href={fwd.url_destino} target="_blank" rel="noopener noreferrer" className="link link-hover link-secondary inline-flex items-center text-sm">
                          {fwd.url_destino} <FaExternalLinkAlt className="ml-1 text-xs" />
                      </a>
                  </td>
                  <td><span className={`badge badge-sm ${
                      fwd.metodo === 'POST' ? 'badge-success' :
                      fwd.metodo === 'GET' ? 'badge-info' :
                      fwd.metodo === 'PUT' ? 'badge-warning' :
                      fwd.metodo === 'DELETE' ? 'badge-error' :
                      'badge-ghost'
                      }`}>{fwd.metodo}</span></td>
                   <td className="text-xs text-gray-500">{fwd.updated_at ? new Date(fwd.updated_at).toLocaleString() : '-'}</td>
                  <td className="text-right">
                    <div className="flex gap-1 justify-end">
                      <button
                        className="btn btn-xs btn-ghost text-info tooltip" data-tip="Editar"
                        onClick={() => handleEditClick(fwd)}
                        disabled={loading} // Desabilita durante loading geral
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="btn btn-xs btn-ghost text-secondary tooltip" data-tip="Exportar"
                        onClick={() => handleExportClick(fwd.id)}
                        disabled={loading} // Desabilita durante loading geral
                      >
                        <FaFileExport />
                      </button>
                      <button
                        className="btn btn-xs btn-ghost text-error tooltip" data-tip="Deletar"
                        onClick={() => handleDeleteClick(fwd)}
                        disabled={loading} // Desabilita durante loading geral
                      >
                        <FaTrashAlt />
                      </button>
                    </div>
                  </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default ForwardList;
