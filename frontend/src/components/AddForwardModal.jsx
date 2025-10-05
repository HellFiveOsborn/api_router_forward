import React, { useState, useEffect, useRef } from 'react';
import { createForward, updateForward } from '../services/api';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike'; // Core
import 'prismjs/components/prism-javascript'; // Linguagem JS
import 'prismjs/themes/prism-tomorrow.css'; // Tema escuro (pode escolher outro)
import { FaFileImport } from 'react-icons/fa'; // Ícone para importação

// Estilos básicos para o editor
const editorStyles = {
  fontFamily: '"Fira code", "Fira Mono", monospace',
  fontSize: 14,
  outline: 0,
  lineHeight: 1.5,
  border: '1px solid hsl(var(--bg) / 0.2)',
  borderRadius: 'var(--rounded-btn, 0.5rem)',
  color: 'hsl(var(--bc))',
  minHeight: '10rem', // Aumentado para h-40
};

// Função auxiliar para parsear JSON de configuração com segurança
const parseJsonConfig = (jsonStringOrObject, defaultValue) => {
  if (typeof jsonStringOrObject === 'object' && jsonStringOrObject !== null) {
    return jsonStringOrObject;
  }
  if (typeof jsonStringOrObject === 'string') {
    try {
      return JSON.parse(jsonStringOrObject);
    } catch (e) {
      console.warn("Falha ao parsear config JSON, usando default:", jsonStringOrObject, e);
      return defaultValue;
    }
  }
  return defaultValue;
};


function AddForwardModal({ isOpen, onClose, forwardData, onSave }) {
  const isEditing = Boolean(forwardData && forwardData.id);
  // CORRIGIDO: initialFormData com comentários/exemplos atualizados e sem 'drop'
  const initialFormData = {
    nome: '', custom_route: '', url_destino: '', metodo: 'GET',
    headers_in_config: {}, // Drop removido
    headers_out_config: {}, // Drop removido
    params_config: { type: 'query' }, // Drop removido
    headers_validator_script: '(headers, ctx, route) => {\n  // Modifique/valide headers. Opcionalmente, defina variáveis em ctx.\n  // Parâmetros da rota customizada estão em route.params (ex: route.params.userId).\n  // Ex: ctx.apiKey = headers[\'x-api-key\'];\n  // Ex: delete headers[\'x-unwanted-header\'];\n  // Retorne \'headers\' modificados/originais para permitir.\n  // Retorne null/undefined ou lance erro para bloquear.\n  return headers;\n}',
    params_validator_script: '(params, ctx, route) => {\n  // Modifique/valide query params (GET) ou body (POST).\n  // \'params\' será o objeto queryParams (route.query_params) ou o objeto body.\n  // Parâmetros da rota customizada estão em route.params (ex: route.params.modelId).\n  // Ex: if (params.userId > 1000) throw new Error("ID de usuário inválido");\n  // Ex: ctx.userType = params.isAdmin ? "admin" : "user";\n  // Retorne \'params\' modificado/original para permitir.\n  // Retorne null/undefined ou lance erro para bloquear.\n  return params;\n}',
    response_script: '(responseBody, responseHeaders, ctx, route) => {\n  // Manipule o corpo (Buffer) e/ou headers (objeto) da resposta.\n  // Parâmetros da rota customizada estão em route.params.\n  // Variáveis definidas em etapas anteriores estão em ctx.\n  // Ex: responseHeaders[\'content-type\'] = \'application/json\';\n  // Ex: let bodyObj = JSON.parse(responseBody.toString()); bodyObj.processed = ctx.processedFlag;\n  // IMPORTANTE: Retorne um objeto { body: corpoModificado, headers: headersModificados }.\n  // Se retornar apenas o corpo, os headers modificados aqui NÃO serão aplicados.\n  // Retornar undefined não altera nada.\n  // Lançar um erro aqui resultará em 500 para o cliente.\n  return { body: responseBody, headers: responseHeaders };\n}',
  };

  const [formData, setFormData] = useState(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [importedConfig, setImportedConfig] = useState(null);
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('headers');

  useEffect(() => {
    if (isOpen) {
      if (isEditing && forwardData) {
        setFormData({
          ...initialFormData, ...forwardData,
          // Garante que configs sejam objetos e scripts sejam strings
          headers_in_config: parseJsonConfig(forwardData.headers_in_config, {}),
          headers_out_config: parseJsonConfig(forwardData.headers_out_config, {}),
          params_config: parseJsonConfig(forwardData.params_config, { type: forwardData.metodo === 'GET' ? 'query' : 'body' }),
          headers_validator_script: forwardData.headers_validator_script || initialFormData.headers_validator_script,
          params_validator_script: forwardData.params_validator_script || initialFormData.params_validator_script,
          response_script: forwardData.response_script || initialFormData.response_script,
        });
      } else {
        setFormData(initialFormData);
      }
      // Reseta a aba ativa sempre que o modal abrir
      setActiveTab('headers');
      setError('');
    }
  }, [isOpen, isEditing, forwardData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newState = { ...prev, [name]: value };

      // Ajusta o tipo de params_config baseado no método HTTP
      if (name === 'metodo') {
        newState.params_config = {
          ...(newState.params_config || {}),
          type: ['POST', 'PUT', 'PATCH'].includes(value) ? 'body' : 'query'
        };
      }

      // Auto-preenche Rota Customizada se URL de Destino for válida e Rota Customizada estiver vazia
      if (name === 'url_destino' && (!prev.custom_route || prev.custom_route === '')) {
        try {
          // Usa a mesma lógica do helper do backend/frontend para extrair o path
          const base = value.startsWith('/') ? window.location.origin : undefined;
          const parsedUrl = new URL(value, base);
          const pathname = parsedUrl.pathname || '/';
          const defaultPath = pathname === '/' ? '/' : pathname.replace(/\/$/, ''); // Remove barra final
          if (defaultPath) {
            newState.custom_route = defaultPath;
            console.log("Rota customizada sugerida:", defaultPath);
          }
        } catch (urlError) {
          // URL inválida, não faz nada.
          // console.warn("URL de destino inválida para sugestão de rota:", value);
        }
      }

      return newState;
    });
  };

  // handleConfigChange não é mais necessário pois removemos os inputs de drop

  const handleScriptChange = (scriptField, value) => {
    setFormData(prev => ({ ...prev, [scriptField]: value }));
  };

  // Função para lidar com o clique no botão de importação
  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  // Função para processar o arquivo importado
  const handleFileImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);

        // Verificar se o arquivo tem o formato esperado (array de objetos ou objeto único)
        if (Array.isArray(importedData) && importedData.length > 0) {
          // Se for um array, pegar o primeiro item
          setImportedConfig(importedData[0]);
          setShowConfirmDialog(true);
        } else if (typeof importedData === 'object' && importedData !== null) {
          // Se for um objeto único
          setImportedConfig(importedData);
          setShowConfirmDialog(true);
        } else {
          setError('Formato de arquivo inválido. O arquivo deve conter um objeto de configuração válido.');
        }
      } catch (error) {
        setError(`Erro ao processar o arquivo: ${error.message}`);
      }

      // Limpar o input para permitir selecionar o mesmo arquivo novamente
      event.target.value = '';
    };

    reader.onerror = () => {
      setError('Erro ao ler o arquivo.');
      event.target.value = '';
    };

    reader.readAsText(file);
  };

  // Função para confirmar a importação
  const handleConfirmImport = () => {
    if (importedConfig) {
      // Preparar os dados importados
      const configToApply = {
        ...initialFormData,
        ...importedConfig,
        // Garantir que configs sejam objetos e scripts sejam strings
        headers_in_config: parseJsonConfig(importedConfig.headers_in_config, {}),
        headers_out_config: parseJsonConfig(importedConfig.headers_out_config, {}),
        params_config: parseJsonConfig(importedConfig.params_config, {
          type: importedConfig.metodo === 'GET' ? 'query' : 'body'
        }),
        headers_validator_script: importedConfig.headers_validator_script || initialFormData.headers_validator_script,
        params_validator_script: importedConfig.params_validator_script || initialFormData.params_validator_script,
        response_script: importedConfig.response_script || initialFormData.response_script,
      };

      // Remover o ID se estiver presente (para evitar conflitos ao criar novo)
      if (!isEditing && configToApply.id) {
        delete configToApply.id;
      }

      // Aplicar a configuração importada
      setFormData(configToApply);
      setShowConfirmDialog(false);
      setImportedConfig(null);
    }
  };

  // Função para cancelar a importação
  const handleCancelImport = () => {
    setShowConfirmDialog(false);
    setImportedConfig(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const dataToSend = {
        ...formData,
        custom_route: formData.custom_route || null,
        // Garante que configs sejam strings JSON ao enviar
        headers_in_config: JSON.stringify(formData.headers_in_config || {}),
        headers_out_config: JSON.stringify(formData.headers_out_config || {}),
        params_config: JSON.stringify(formData.params_config || {}),
      };
      let savedForward;
      if (isEditing) {
        savedForward = await updateForward(forwardData.id, dataToSend);
      } else {
        savedForward = await createForward(dataToSend);
      }
      onSave(savedForward, isEditing);
      onClose();
    } catch (err) {
      setError(err?.data?.message || err.message || "Erro desconhecido ao salvar.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <dialog id="forward_modal" className="modal modal-open bg-black bg-opacity-50">
      <div className="modal-box w-11/12 max-w-6xl">
        <button type="button" className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        <h3 className="font-bold text-lg mb-4">{isEditing ? 'Editar Forward' : 'Adicionar Novo Forward'}</h3>
        <form onSubmit={handleSubmit}>
          {error && <div role="alert" className="alert alert-error mb-4 text-sm p-2"><span>{error}</span></div>}

          {/* Campos Principais */}
          {/* Campos Principais - Grid Responsivo com Colspan */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-4 mb-4"> {/* Grid com gap */}
            {/* Nome Identificador (Ocupa 1 coluna em LG) */}
            <div className="flex flex-col">
              <div className="form-control w-full">
                <label className="label pb-1"><span className="label-text">Nome Identificador *</span></label>
                <input type="text" name="nome" placeholder="Ex: meu-chat-gpt" className="input input-bordered w-full" value={formData.nome} onChange={handleChange} required disabled={loading} />
              </div>
            </div>
            {/* Método HTTP (Ocupa 1 coluna em LG) */}
            <div className="flex flex-col">
              <div className="form-control w-full">
                <label className="label pb-1"><span className="label-text">Método HTTP *</span></label>
                <select name="metodo" className="select select-bordered w-full" value={formData.metodo} onChange={handleChange} required disabled={loading}>
                  <option value="GET">GET</option> <option value="POST">POST</option> <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option> <option value="PATCH">PATCH</option>
                </select>
              </div>
            </div>
            {/* URL de Destino (Ocupa 2 colunas em LG) */}
            <div className="flex flex-col lg:col-span-2"> {/* <<<<<<< COLSPAN ADICIONADO */}
              <div className="form-control w-full">
                <label className="label pb-1"><span className="label-text">URL de Destino (Template) *</span></label>
                <input type="text" name="url_destino" placeholder="https://api.exemplo.com/{param1}/items/{itemId}" className="input input-bordered w-full" value={formData.url_destino} onChange={handleChange} required disabled={loading} />
              </div>
              <div className="label pt-1 pb-0"><span className="label-text-alt text-xs text-opacity-70">Use chaves {'{}'} para variáveis (ex: {'{id}'}). Serão substituídas por valores de `sharedContext` (incluindo `routeParams`).</span></div>
            </div>
            {/* Rota Customizada (Ocupa 2 colunas em LG) */}
            <div className="flex flex-col lg:col-span-2"> {/* <<<<<<< COLSPAN ADICIONADO */}
              <div className="form-control w-full">
                <label className="label pb-1"><span className="label-text">Rota Customizada (Opcional, com parâmetros)</span></label>
                <input type="text" name="custom_route" placeholder="/v1/users/{userId}/posts/{postId}" className="input input-bordered w-full" value={formData.custom_route || ''} onChange={handleChange} disabled={loading} />
              </div>
              <div className="label pt-1 pb-0"><span className="label-text-alt text-xs text-opacity-70">Define o início do caminho após o slug (ex: `/v1/items/{'{id}'}`). Parâmetros {'{}'} estarão em `sharedContext.routeParams`. Se vazio, usa o path da URL de Destino.</span></div>
            </div>
          </div>

          {/* Configurações Avançadas - Tabs controladas por estado React */}
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Configurações Avançadas</h3>
            <div role="tablist" className="tabs tabs-boxed bg-base-200 mb-2">
              <button
                type="button"
                className={`tab tab-bordered cursor-pointer${activeTab === 'headers' ? ' tab-active' : ''}`}
                onClick={() => setActiveTab('headers')}
              >
                Headers de Entrada
              </button>
              <button
                type="button"
                className={`tab tab-bordered cursor-pointer${activeTab === 'params' ? ' tab-active' : ''}`}
                onClick={() => setActiveTab('params')}
              >
                Parâmetros de Entrada
              </button>
              <button
                type="button"
                className={`tab tab-bordered cursor-pointer${activeTab === 'response' ? ' tab-active' : ''}`}
                onClick={() => setActiveTab('response')}
              >
                Manipulação da Resposta
              </button>
            </div>
            <div className="bg-base-100 border border-base-300 rounded-box p-4">
              {activeTab === 'headers' && (
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs">Script Validador/Modificador de Headers (JS):</span></label>
                  <Editor
                    value={formData.headers_validator_script}
                    onValueChange={(code) => handleScriptChange('headers_validator_script', code)}
                    highlight={(code) => highlight(code || '', languages.javascript, 'javascript')}
                    placeholder={initialFormData.headers_validator_script}
                    style={editorStyles}
                    textareaClassName="focus:outline-none"
                    disabled={loading}
                    padding={'1rem'}
                    className="mt-2 bg-base-300"
                  />
                </div>
              )}
              {activeTab === 'params' && (
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs">Script Validador/Modificador de Parâmetros (JS):</span></label>
                  <Editor
                    value={formData.params_validator_script}
                    onValueChange={(code) => handleScriptChange('params_validator_script', code)}
                    highlight={(code) => highlight(code || '', languages.javascript, 'javascript')}
                    style={editorStyles}
                    textareaClassName="focus:outline-none"
                    disabled={loading}
                    placeholder={initialFormData.params_validator_script}
                    padding={'1rem'}
                    className="mt-2 bg-base-300"
                  />
                </div>
              )}
              {activeTab === 'response' && (
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs">Script Manipulador da Resposta (JS):</span></label>
                  <Editor
                    value={formData.response_script}
                    onValueChange={(code) => handleScriptChange('response_script', code)}
                    highlight={(code) => highlight(code || '', languages.javascript, 'javascript')}
                    style={editorStyles}
                    textareaClassName="focus:outline-none"
                    disabled={loading}
                    placeholder={initialFormData.response_script}
                    padding={'1rem'}
                    className="mt-2 bg-base-300"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Input de arquivo oculto para importação */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".json"
            style={{ display: 'none' }}
          />

          {/* Ações */}
          <div className="modal-action mt-6">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleImportClick}
              disabled={loading}
            >
              <FaFileImport className="mr-1" /> Importar JSON
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-sm"></span> : (isEditing ? 'Salvar Alterações' : 'Criar Forward')}
            </button>
          </div>
        </form>
      </div>

      {/* Diálogo de confirmação para importação */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-base-100 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="font-bold text-lg mb-4">Confirmar Importação</h3>
            <p className="mb-6">
              A configuração atual será substituída pelos dados importados. Esta ação não pode ser desfeita.
              Deseja continuar?
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                onClick={handleCancelImport}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmImport}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}

export default AddForwardModal;