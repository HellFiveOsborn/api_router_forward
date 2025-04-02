import React, { useState, useEffect } from 'react';
import { createForward, updateForward } from '../services/api';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike'; // Core
import 'prismjs/components/prism-javascript'; // Linguagem JS
import 'prismjs/themes/prism-tomorrow.css'; // Tema escuro (pode escolher outro)

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
    headers_validator_script: '(headers, sharedContext) => {\n  // Modifique/valide headers. Opcionalmente, defina variáveis em sharedContext.\n  // Ex: sharedContext.apiKey = headers[\'x-api-key\'];\n  // Ex: delete headers[\'x-unwanted-header\'];\n  // Retorne \'headers\' modificados/originais para permitir.\n  // Retorne null/undefined ou lance erro para bloquear.\n  return headers;\n}',
    params_validator_script: '(params, sharedContext) => {\n  // Modifique/valide query params (GET) ou body (POST).\n  // \'params\' será o objeto queryParams ou o objeto body.\n  // Ex: if (params.userId > 1000) throw new Error("ID de usuário inválido");\n  // Ex: sharedContext.userType = params.isAdmin ? "admin" : "user";\n  // Retorne \'params\' modificado/original para permitir.\n  // Retorne null/undefined ou lance erro para bloquear.\n  return params;\n}',
    response_script: '(responseBody, responseHeaders, sharedContext) => {\n  // Manipule o corpo (Buffer) ou headers (objeto) da resposta.\n  // Acesse variáveis do contexto: if (sharedContext.apiKey) { ... }\n  // Ex: responseHeaders[\'x-user-type\'] = sharedContext.userType || "unknown";\n  // Retorne o corpo modificado (string, Buffer, etc.) ou original.\n  // Retornar undefined não altera o corpo.\n  // Lançar erro resultará em 500.\n  return responseBody;\n}',
  };

  const [formData, setFormData] = useState(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="form-control">
              <label className="label"><span className="label-text">Nome Identificador *</span></label>
              <input type="text" name="nome" placeholder="Ex: meu-chat-gpt" className="input input-bordered" value={formData.nome} onChange={handleChange} required disabled={loading} />
            </div>
             <div className="form-control">
              <label className="label"><span className="label-text">Método HTTP *</span></label>
              <select name="metodo" className="select select-bordered" value={formData.metodo} onChange={handleChange} required disabled={loading}>
                <option value="GET">GET</option> <option value="POST">POST</option> <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option> <option value="PATCH">PATCH</option>
              </select>
            </div>
             <div className="form-control">
              <label className="label"><span className="label-text">URL de Destino *</span></label>
              <input type="url" name="url_destino" placeholder="https://api.exemplo.com/endpoint" className="input input-bordered" value={formData.url_destino} onChange={handleChange} required disabled={loading} />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Rota Customizada (Opcional)</span></label>
              <input type="text" name="custom_route" placeholder="/v1/proxy/meu-chat (inicia com /)" className="input input-bordered" value={formData.custom_route || ''} onChange={handleChange} disabled={loading} />
               <div className="label"><span className="label-text-alt">Se vazio, usará /&lt;slug-do-nome&gt;/&lt;path-da-url-destino&gt;/*</span></div>
            </div>
          </div>

           {/* Configurações Avançadas - Separadas em Acordeões */}
           <div className="space-y-3 mt-6">
                <h3 className="text-lg font-medium mb-2">Configurações Avançadas</h3>

                 {/* Headers de Entrada */}
                 <div className="collapse collapse-arrow bg-base-200 border border-base-300 rounded-box">
                    <input type="checkbox" className="peer" />
                    <div className="collapse-title font-medium peer-checked:bg-base-300">Headers de Entrada (Validação e Modificação)</div> {/* Título ajustado */}
                    <div className="collapse-content bg-base-100 peer-checked:border-t border-base-300 p-4">
                        <div className="form-control">
                            <label className="label py-1"><span className="label-text text-xs">Script Validador/Modificador de Headers (JS):</span></label> {/* Label ajustada */}
                            <Editor 
                              value={formData.headers_validator_script} 
                              onValueChange={(code) => handleScriptChange('headers_validator_script', code)}
                              highlight={(code) => highlight(code || '', languages.javascript, 'javascript')} 
                              placeholder={initialFormData.headers_validator_script} // Usa o placeholder do estado inicial
                              style={editorStyles} 
                              textareaClassName="focus:outline-none" 
                              disabled={loading}
                              padding={'1rem'}
                              className="mt-2 bg-base-300" />
                        </div>
                    </div>
                 </div>

                 {/* Parâmetros de Entrada */}
                 <div className="collapse collapse-arrow bg-base-200 border border-base-300 rounded-box">
                     <input type="checkbox" className="peer" />
                     <div className="collapse-title font-medium peer-checked:bg-base-300">Parâmetros de Entrada ({formData.params_config?.type === 'body' ? 'Corpo JSON' : 'Query Params'}) (Validação e Modificação)</div>
                     <div className="collapse-content bg-base-100 peer-checked:border-t border-base-300 p-4">
                        <div className="form-control">
                            <label className="label py-1"><span className="label-text text-xs">Script Validador/Modificador de Parâmetros (JS):</span></label> {/* Label ajustada */}
                             <Editor 
                              value={formData.params_validator_script} 
                              onValueChange={(code) => handleScriptChange('params_validator_script', code)}
                              highlight={(code) => highlight(code || '', languages.javascript, 'javascript')}
                              style={editorStyles} 
                              textareaClassName="focus:outline-none" 
                              disabled={loading}
                              placeholder={initialFormData.params_validator_script} // Usa o placeholder do estado inicial
                              padding={'1rem'}
                              className="mt-2 bg-base-300" />
                        </div>
                    </div>
                 </div>

                 {/* Seção Headers de Saída REMOVIDA */}

                 {/* Manipulação da Resposta */}
                 <div className="collapse collapse-arrow bg-base-200 border border-base-300 rounded-box">
                     <input type="checkbox" className="peer" />
                     <div className="collapse-title font-medium peer-checked:bg-base-300">Manipulação da Resposta (Script)</div>
                     <div className="collapse-content bg-base-100 peer-checked:border-t border-base-300 p-4">
                        <div className="form-control">
                            <label className="label py-1"><span className="label-text text-xs">Script Manipulador da Resposta (JS):</span></label>
                             <Editor 
                                value={formData.response_script} 
                                onValueChange={(code) => handleScriptChange('response_script', code)}
                                highlight={(code) => highlight(code || '', languages.javascript, 'javascript')} 
                                style={editorStyles} 
                                textareaClassName="focus:outline-none" 
                                disabled={loading}
                                placeholder={initialFormData.response_script} // Usa o placeholder do estado inicial
                                padding={'1rem'}
                                className="mt-2 bg-base-300" />
                        </div>
                    </div>
                 </div>
            </div> {/* Fim do space-y-3 */}

          {/* Ações */}
          <div className="modal-action mt-6">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-sm"></span> : (isEditing ? 'Salvar Alterações' : 'Criar Forward')}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

export default AddForwardModal;