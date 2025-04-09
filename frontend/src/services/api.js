// frontend/src/services/api.js
let API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/'; // Usa a variável do .env ou um padrão
API_URL = API_URL.endsWith('/') ? `${API_URL}api` : `${API_URL}/api`; // Certifica-se de que a URL termina com uma barra

const getAuthToken = () => {
  // Idealmente, verificar se o token não expirou aqui também, se possível
  return localStorage.getItem('authToken');
};

const setAuthToken = (token) => {
    if (token) {
        localStorage.setItem('authToken', token);
    } else {
        localStorage.removeItem('authToken');
    }
};

const apiFetch = async (endpoint, options = {}) => {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers, // Permite sobrescrever ou adicionar headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);

    // Se a resposta for 204 No Content, não tente parsear JSON
    if (response.status === 204) {
        return { success: true, status: 204 }; // Retorna um objeto indicando sucesso
    }

    // Tenta ler o corpo como texto primeiro para depuração e para evitar erro se não for JSON
    const responseText = await response.text();
    let data;
    try {
        data = responseText ? JSON.parse(responseText) : null; // Parseia se não estiver vazio
    } catch (jsonError) {
        // Se não for JSON válido, mas a resposta foi OK (ex: 200), pode ser um problema
        if (response.ok) {
            console.warn(`API (${endpoint}) retornou status ${response.status} mas o corpo não é JSON válido:`, responseText);
            // Retornar o texto bruto ou um erro específico? Depende do caso de uso.
            // Por ora, vamos retornar o texto se a resposta foi OK.
             return responseText;
        } else {
            // Se a resposta não foi OK e não é JSON, use o texto como mensagem de erro
            console.error(`Erro na API (${endpoint}): Status ${response.status}, Corpo não-JSON:`, responseText);
            const error = new Error(`Erro ${response.status}: ${response.statusText}. Resposta não JSON recebida.`);
            error.status = response.status;
            error.data = responseText; // Anexa o texto bruto
            throw error;
        }
    }


    if (!response.ok) {
      // Se a API retornar um erro estruturado (ex: { message: '...' }), use-o
      const errorMessage = data?.message || `Erro ${response.status}: ${response.statusText}`;
      console.error(`Erro na API (${endpoint}):`, errorMessage, data);
      // Lança um erro que pode ser capturado no componente que chamou a função
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data; // Anexa dados adicionais do erro, se houver
      // Se for 401 ou 403 (não autorizado/token inválido/expirado), limpar o token local pode ser útil
      if (response.status === 401 || response.status === 403) {
          console.log("Token inválido ou expirado detectado. Limpando token local e disparando evento auth-error.");
          setAuthToken(null);
          window.dispatchEvent(new Event('auth-error')); // Dispara o evento global
      }
      throw error;
    }

    return data; // Retorna os dados em caso de sucesso

  } catch (error) {
    console.error(`Erro na requisição para ${API_URL}${endpoint}:`, error);
    // Re-lança o erro para ser tratado no local da chamada,
    // a menos que já seja um erro da API formatado
    if (error.status) {
        throw error; // Já é um erro da API formatado
    } else {
        // Erro de rede ou outro erro inesperado
        throw new Error(`Erro de rede ou inesperado ao chamar ${endpoint}. Verifique a conexão e o console.`);
    }
  }
};

// --- Funções da API ---

export const login = async (username, password) => {
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data && data.token) {
      setAuthToken(data.token); // Armazena o token no localStorage
    }
    return data; // Retorna { token: '...' } ou lança erro
  } catch (error) {
    setAuthToken(null); // Garante que token antigo seja removido em caso de falha no login
    throw error; // Re-lança o erro para o componente de UI tratar
  }
};

export const logout = () => {
    setAuthToken(null); // Simplesmente remove o token
    // Opcional: chamar um endpoint de logout no backend se existir
};

export const getForwards = () => {
  return apiFetch('/forwards'); // GET é o padrão
};

export const getForwardById = (id) => {
  return apiFetch(`/forwards/${id}`);
};

export const createForward = (forwardData) => {
  return apiFetch('/forwards', {
    method: 'POST',
    body: JSON.stringify(forwardData),
  });
};

export const updateForward = (id, forwardData) => {
  return apiFetch(`/forwards/${id}`, {
    method: 'PUT',
    body: JSON.stringify(forwardData),
  });
};

export const deleteForward = (id) => {
  return apiFetch(`/forwards/${id}`, {
    method: 'DELETE',
  });
};

export const exportForwardConfig = async (id) => {
  try {
    // Usar apiFetch para obter os dados com autenticação adequada
    const data = await apiFetch(`/forwards/export/${id}`);
    
    // Criar um blob com os dados JSON formatados
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    
    // Criar URL para o blob
    const url = URL.createObjectURL(blob);
    
    // Criar um link temporário para download
    const link = document.createElement('a');
    link.href = url;
    const fileName = `forward_${id}_${data.slug || 'config'}.json`;
    link.setAttribute('download', fileName);
    
    // Simular clique para iniciar o download
    document.body.appendChild(link);
    link.click();
    
    // Limpar
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error(`Erro ao exportar configuração do forward ${id}:`, error);
    throw error;
  }
};

export const importForwardConfig = async (configData, isNew = true, forwardId = null) => {
  try {
    // Se isNew for true, cria um novo forward com os dados importados
    // Se isNew for false, atualiza um forward existente com os dados importados
    const endpoint = isNew ? '/forwards/import' : `/forwards/import/${forwardId}`;
    
    return await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(configData),
    });
  } catch (error) {
    console.error(`Erro ao importar configuração do forward:`, error);
    throw error;
  }
};

// Verifica se o token atual ainda é válido (exemplo básico, não verifica expiração real sem decodificar)
export const checkAuth = () => {
    return !!getAuthToken();
};


// Exporta a função genérica também, se útil
export default apiFetch;
