// frontend/src/context/AuthContext.jsx
import React, { createContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, checkAuth } from '../services/api'; // Importa funções da API

// Cria o contexto
export const AuthContext = createContext(null);

// Cria o provedor do contexto
export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true); // Estado para verificar auth inicial

  // Verifica o token ao carregar o app
  useEffect(() => {
    const verifyAuth = () => {
        console.log("Verificando autenticação inicial...");
        try {
            const hasToken = checkAuth(); // Verifica se existe um token (não valida expiração aqui)
            console.log("Token encontrado:", hasToken);
            setIsAuthenticated(hasToken);
        } catch (error) {
            console.error("Erro ao verificar autenticação inicial:", error);
            setIsAuthenticated(false);
            apiLogout(); // Limpa token inválido se houver erro na verificação (embora checkAuth não faça chamada API)
        } finally {
            setLoadingAuth(false); // Finaliza a verificação inicial
            console.log("Verificação inicial concluída. Autenticado:", isAuthenticated);
        }
    };
    verifyAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Executa apenas uma vez na montagem

  // Função de login
  const login = useCallback(async (username, password) => {
    console.log("Tentando login...");
    setLoadingAuth(true); // Pode usar um loading específico para login se preferir
    try {
      const data = await apiLogin(username, password); // Chama a API de login
      if (data && data.token) {
        console.log("Login bem-sucedido, token recebido.");
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
      apiLogout(); // Garante que qualquer token antigo seja limpo
      throw error; // Re-lança o erro para o componente Login tratar (exibir mensagem)
    } finally {
        setLoadingAuth(false);
        console.log("Tentativa de login finalizada.");
    }
  }, []);

  // Função de logout
  const logout = useCallback(() => {
    console.log("Executando logout...");
    apiLogout(); // Limpa o token do localStorage
    setIsAuthenticated(false); // Atualiza o estado
    // Opcional: redirecionar para a tela de login aqui ou no componente que chama logout
    console.log("Logout concluído.");
  }, []);

  // Valor fornecido pelo contexto
  const value = {
    isAuthenticated,
    loadingAuth, // Para exibir um loader enquanto verifica o auth inicial
    login,
    logout,
  };

   // Log de mudança de estado para depuração
   useEffect(() => {
    console.log("Estado de autenticação mudou:", isAuthenticated);
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider value={value}>
      {/* Exibe children apenas após a verificação inicial OU sempre exibe e deixa App.jsx decidir */}
      {/* {!loadingAuth ? children : <div>Verificando autenticação...</div>} */}
      {children} {/* Deixar App.jsx controlar o que mostrar durante o loading inicial */}
    </AuthContext.Provider>
  );
};