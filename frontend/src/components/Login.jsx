// frontend/src/components/Login.jsx
import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FiUser, FiLock, FiEye, FiEyeOff, FiAlertCircle, FiSun, FiMoon } from 'react-icons/fi';
import { LogIn, Sparkles } from 'lucide-react';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [theme, setTheme] = useState(() => {
    // Carrega o tema salvo (padrão: light)
    return localStorage.getItem('theme') || 'light';
  });
  const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001';

  // Aplica tema DaisyUI via data-theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const auth = useContext(AuthContext);

  if (!auth) {
    console.error("AuthContext não encontrado. Verifique se Login está dentro de AuthProvider.");
    return <div className="min-h-screen grid place-items-center bg-base-200">Erro: Contexto de autenticação não disponível.</div>;
  }

  const { login } = auth;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      // Se desejar, poderíamos persistir o usuário quando "Lembrar-me" estiver marcado.
      if (rememberMe) {
        localStorage.setItem('rf_last_user', username);
      } else {
        localStorage.removeItem('rf_last_user');
      }
    } catch (err) {
      console.error("Erro no login:", err);
      const apiErrorMessage = err?.data?.message || err.message;
      setError(apiErrorMessage || 'Falha no login. Verifique suas credenciais ou o console para mais detalhes.');
    } finally {
      setLoading(false);
    }
  };

  // Carrega último usuário lembrado (apenas inicial)
  useEffect(() => {
    const lastUser = localStorage.getItem('rf_last_user');
    if (lastUser) {
      setUsername(lastUser);
      setRememberMe(true);
    }
  }, []);

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-gradient-to-br from-primary/10 via-base-200 to-secondary/10 p-4 overflow-hidden">
      {/* Elementos decorativos de fundo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/20 rounded-full blur-3xl animate-pulse-soft"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-pulse-soft" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent/10 rounded-full blur-3xl animate-pulse-soft" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-10">
        <div className="dropdown dropdown-end">
          <label tabIndex={0} className="btn btn-ghost btn-sm gap-2 glass-effect">
            {theme === 'light' ? <FiSun className="text-warning" /> : <FiMoon className="text-info" />}
            <span className="hidden sm:inline">Tema</span>
          </label>
          <ul tabIndex={0} className="dropdown-content z-[1] p-2 shadow-2xl bg-base-100 rounded-box w-52 max-h-96 overflow-y-auto mt-2">
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
      </div>

      {/* Card de Login */}
      <div className="card w-full max-w-md glass-effect shadow-2xl border border-base-300 z-10 animate-scale-in">
        <div className="card-body">
          {/* Branding */}
          <div className="flex flex-col items-center mb-6 animate-fade-in">
            <h2 className="card-title text-3xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Route Forward
            </h2>
            <p className="text-sm opacity-70 mt-2">Autentique-se para acessar o painel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="alert alert-error shadow-lg animate-shake">
                <FiAlertCircle className="h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Usuário */}
            <div className="form-control animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <label className="label">
                <span className="label-text font-medium">Usuário</span>
              </label>
              <label className="input input-bordered flex items-center gap-2 focus-within:input-primary transition-all w-full">
                <FiUser className="opacity-70" />
                <input
                  type="text"
                  placeholder="Digite seu usuário"
                  className="grow"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="username"
                />
              </label>
            </div>

            {/* Senha */}
            <div className="form-control animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <label className="label">
                <span className="label-text font-medium">Senha</span>
              </label>
              <label className="input input-bordered flex items-center gap-2 focus-within:input-primary transition-all w-full">
                <FiLock className="opacity-70" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  className="grow"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-xs hover-lift"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  disabled={loading}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </label>
            </div>

            {/* Ações secundárias */}
            <div className="flex items-center justify-between animate-slide-up" style={{ animationDelay: '0.3s' }}>
              <label className="label cursor-pointer gap-2 hover:bg-base-200 rounded-lg px-2 py-1 transition-all">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                />
                <span className="label-text text-sm">Lembrar-me</span>
              </label>
            </div>

            {/* Submit */}
            <div className="form-control mt-6 animate-slide-up" style={{ animationDelay: '0.4s' }}>
              <button type="submit" className="btn btn-primary w-full gap-2 shadow-lg hover-lift" disabled={loading}>
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Entrar
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        <p className="text-xs opacity-60 text-center animate-fade-in">
          &copy; {new Date().getFullYear()} Route Forward - Gerenciador de Encaminhamento de API
        </p>
      </div>
    </div>
  );
}

export default Login;