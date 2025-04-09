// frontend/src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, checkAuth } from '../services/api'; // Importa funções da API

// Cria o contexto
export const AuthContext = createContext(null);

// Cria o provedor do contexto
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true); // Estado para verificar auth inicial

  // Função de logout - Definida primeiro para evitar problemas de referência
  const logout = useCallback(() => {
    apiLogout(); // Limpa o token do localStorage
    setIsAuthenticated(false); // Atualiza o estado
    // Opcional: redirecionar para a tela de login aqui ou no componente que chama logout
  }, []); // Removendo dependências para evitar referência circular

  // Removido o handleAuthError para evitar problemas de referência circular

  // Verifica o token ao carregar o app
  useEffect(() => {
    const verifyAuth = async () => {
        try {
            const hasToken = checkAuth(); // Verifica se existe um token (não valida expiração aqui)
            setIsAuthenticated(hasToken);
        } catch (error) {
            console.error("Erro ao verificar autenticação inicial:", error);
            setIsAuthenticated(false);
            // Usar apiLogout diretamente em vez de logout para evitar referência circular
            apiLogout(); // Limpa token inválido se houver erro na verificação
        } finally {
            setLoadingAuth(false); // Finaliza a verificação inicial
        }
    };
    verifyAuth();
  }, []); // Não precisa de dependências, pois é executado apenas uma vez na montagem

  // Função de login
  const login = useCallback(async (username, password) => {
    setLoadingAuth(true); // Pode usar um loading específico para login se preferir
    try {
      const data = await apiLogin(username, password); // Chama a API de login
      if (data && data.token) {
        setIsAuthenticated(true); // Atualiza o estado
        // O token já foi salvo no localStorage pela função apiLogin
        return true; // Indica sucesso
      } else {
         // Caso a API retorne sucesso mas sem token (improvável com a lógica atual)
         console.error("Login bem-sucedido mas token não recebido.");
         throw new Error("Token não recebido após login.");
      }
    } catch (error) {
      console.error("Falha no login (AuthContext):", error);
      setIsAuthenticated(false);
      // Usar apiLogout diretamente em vez de logout para evitar referência circular
      apiLogout(); // Garante que qualquer token antigo seja limpo
      throw error; // Re-lança o erro para o componente Login tratar (exibir mensagem)
    } finally {
        setLoadingAuth(false);
    }
  }, [setIsAuthenticated, setLoadingAuth]); // Não incluir logout nas dependências

  // Nota: A função de logout foi definida no início do componente

  // Listener para erros de autenticação vindos da API
  useEffect(() => {
    
    // Função inline para evitar dependência de handleAuthError
    const authErrorHandler = () => {
      console.warn("AuthContext: Evento 'auth-error' recebido. Executando logout.");
      apiLogout(); // Limpa o token do localStorage diretamente
      setIsAuthenticated(false); // Atualiza o estado
    };
    
    document.addEventListener('auth-error', authErrorHandler);

    // Cleanup: remove o listener quando o componente desmontar
    return () => {
      document.removeEventListener('auth-error', authErrorHandler);
    };
  }, []); // Sem dependências externas

  // Valor fornecido pelo contexto
  const value = {
    isAuthenticated,
    loadingAuth, // Para exibir um loader enquanto verifica o auth inicial
    login,
    logout,
  };

  // Log de mudança de estado para depuração
  useEffect(() => {
    // Agora podemos logar com segurança o estado atual
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider value={value}>
      {/* Exibe children apenas após a verificação inicial OU sempre exibe e deixa App.jsx decidir */}
      {/* {!loadingAuth ? children : <div>Verificando autenticação...</div>} */}
      {children} {/* Deixar App.jsx controlar o que mostrar durante o loading inicial */}
    </AuthContext.Provider>
  );
};
