// frontend/src/components/Login.jsx
import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext'; // Criaremos este contexto a seguir

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = useContext(AuthContext); // Obtém o contexto completo

   // Verifica se o contexto foi carregado corretamente
   if (!auth) {
    console.error("AuthContext não encontrado. Verifique se Login está dentro de AuthProvider.");
    return <div>Erro: Contexto de autenticação não disponível.</div>;
  }

  const { login } = auth; // Extrai a função login

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Chama a função login do contexto
      await login(username, password);
      // O AuthContext cuidará de atualizar o estado isAuthenticated,
      // e o App.jsx re-renderizará para mostrar o dashboard.
      // Não precisamos de redirecionamento explícito aqui se App.jsx fizer a lógica condicional.
    } catch (err) {
      console.error("Erro no login:", err);
      // Tenta pegar a mensagem de erro da API, se disponível
      const apiErrorMessage = err?.data?.message || err.message;
      setError(apiErrorMessage || 'Falha no login. Verifique suas credenciais ou o console para mais detalhes.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-secondary p-4">
      <div className="card w-full max-w-sm bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title justify-center text-2xl mb-6 font-bold">
            Route Forward
          </h2>
          <form onSubmit={handleSubmit}>
            {error && (
                <div role="alert" className="alert alert-error mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{error}</span>
                </div>
            )}
            <div className="form-control mb-3">
              <label className="label">
                <span className="label-text">Usuário</span>
              </label>
              <input
                type="text"
                placeholder="Digite seu usuário"
                className="input input-bordered w-full"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>
            <div className="form-control mb-6">
              <label className="label">
                <span className="label-text">Senha</span>
              </label>
              <input
                type="password"
                placeholder="Digite sua senha"
                className="input input-bordered w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
            <div className="form-control mt-6">
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? <span className="loading loading-spinner loading-sm"></span> : 'Entrar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;