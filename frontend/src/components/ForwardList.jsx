// frontend/src/components/ForwardList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getForwards, deleteForward, exportForwardConfig } from '../services/api'; // Importa funções da API
import { FaEdit, FaTrashAlt, FaExternalLinkAlt, FaPlus, FaFileExport } from 'react-icons/fa'; // Ícones
import { FiSearch, FiFilter, FiCopy, FiCheck } from 'react-icons/fi';
import { Copy, Check, ExternalLink, Trash2, Edit, FileDown, AlertTriangle } from 'lucide-react';

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
  const [copiedIds, setCopiedIds] = useState({});

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
    <div className="relative">
      {/* Mostra erro mesmo se houver dados (ex: erro ao deletar) */}
      {error && forwards.length > 0 && (
        <div role="alert" className="alert alert-warning shadow-xl mb-4 animate-shake">
          <AlertTriangle className="h-5 w-5" />
          <span>{error}</span>
          <button className="btn btn-xs btn-ghost" onClick={() => setError('')}>Fechar</button>
        </div>
      )}

      {forwards.length === 0 && !loading ? (
        <div className="card bg-base-100 shadow-xl border-2 border-dashed border-base-300 animate-fade-in">
          <div className="card-body items-center text-center py-16">
            <div className="bg-base-200 p-6 rounded-full mb-4">
              <FaPlus className="w-12 h-12 opacity-50" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Nenhum forward configurado</h3>
            <p className="opacity-70 mb-6">Comece criando seu primeiro encaminhador de API</p>
            <button className="btn btn-primary gap-2" onClick={onAdd}>
              <FaPlus /> Criar Primeiro Forward
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {forwards.map((fwd, index) => {
            // Determina a rota baseada no slug e custom_route (simplificado)
            let routePath = `/${fwd.slug}`;

            // Adiciona custom_route se existir e não for apenas '/'
            if (fwd.custom_route && fwd.custom_route.trim() !== '' && fwd.custom_route !== '/') {
              const customRoute = fwd.custom_route.startsWith('/') ? fwd.custom_route : '/' + fwd.custom_route;
              routePath += customRoute;
            }

            // Monta a rota completa com wildcard
            const route = `${routePath}/*`;

            // Obtém o host do ambiente ou usa o atual
            const apiUrl = import.meta.env?.VITE_API_URL || 'http://localhost:3001';
            const baseUrl = apiUrl.replace('/api', ''); // Remove '/api' se existir
            const fullRoute = `${baseUrl}${route}`;

            const handleCopyRoute = () => {
              navigator.clipboard.writeText(fullRoute.slice(0, -1));
              setCopiedIds(prev => ({ ...prev, [fwd.id]: true }));
              setTimeout(() => {
                setCopiedIds(prev => ({ ...prev, [fwd.id]: false }));
              }, 2000);
            };

            const isCopied = copiedIds[fwd.id];

            return (
              <div
                key={fwd.id}
                className="card bg-base-100 shadow-lg hover-lift border border-base-300 animate-fade-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="card-body p-4 md:p-6">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    {/* Informações principais */}
                    <div className="flex-1 space-y-3">
                      {/* Nome e método(s) */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-xl font-bold">{fwd.nome}</h3>
                        {/* Suporta método único (string) ou múltiplos (array) */}
                        {Array.isArray(fwd.metodo) ? (
                          fwd.metodo.map(m => (
                            <span key={m} className={`badge badge-lg ${m === 'POST' ? 'badge-success' :
                              m === 'GET' ? 'badge-info' :
                                m === 'PUT' ? 'badge-warning' :
                                  m === 'DELETE' ? 'badge-error' :
                                    'badge-ghost'
                              }`}>
                              {m}
                            </span>
                          ))
                        ) : (
                          <span className={`badge badge-lg ${fwd.metodo === 'POST' ? 'badge-success' :
                            fwd.metodo === 'GET' ? 'badge-info' :
                              fwd.metodo === 'PUT' ? 'badge-warning' :
                                fwd.metodo === 'DELETE' ? 'badge-error' :
                                  'badge-ghost'
                            }`}>
                            {fwd.metodo}
                          </span>
                        )}
                      </div>

                      {/* Rota do sistema */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm opacity-70">Rota Completa:</span>
                        <div className="flex items-center gap-2 bg-base-200 px-3 py-2 rounded-lg font-mono text-sm flex-1 min-w-0">
                          <code className="truncate flex-1">
                            <span className="opacity-60">{baseUrl}</span>
                            <span className="text-primary font-semibold">{route}</span>
                          </code>
                          <button
                            className="btn btn-xs btn-ghost tooltip tooltip-left"
                            onClick={handleCopyRoute}
                            data-tip={isCopied ? "Copiado!" : "Copiar rota completa"}
                          >
                            {isCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* URL de destino */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm opacity-70">Destino:</span>
                        <a
                          href={fwd.url_destino}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link link-secondary inline-flex items-center gap-1 text-sm"
                        >
                          <span className="truncate max-w-md">{fwd.url_destino}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </div>

                      {/* Data de modificação */}
                      <div className="text-xs opacity-60">
                        Atualizado em: {fwd.updated_at ? new Date(fwd.updated_at).toLocaleString('pt-BR') : '-'}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex md:flex-col gap-2">
                      <button
                        className="btn btn-sm btn-ghost gap-2 hover-lift tooltip tooltip-top"
                        data-tip="Editar"
                        onClick={() => handleEditClick(fwd)}
                        disabled={loading}
                      >
                        <Edit className="w-4 h-4" />
                        <span className="hidden md:inline">Editar</span>
                      </button>
                      <button
                        className="btn btn-sm btn-ghost gap-2 hover-lift tooltip tooltip-top"
                        data-tip="Exportar"
                        onClick={() => handleExportClick(fwd.id)}
                        disabled={loading}
                      >
                        <FileDown className="w-4 h-4" />
                        <span className="hidden md:inline">Exportar</span>
                      </button>
                      <button
                        className="btn btn-sm btn-error btn-outline gap-2 hover-lift tooltip tooltip-top"
                        data-tip="Deletar"
                        onClick={() => handleDeleteClick(fwd)}
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden md:inline">Deletar</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ForwardList;
