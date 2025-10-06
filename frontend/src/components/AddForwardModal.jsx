import React, { useState, useEffect, useRef } from 'react';
import { createForward, updateForward } from '../services/api';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion } from '@codemirror/autocomplete';
import { FaFileImport } from 'react-icons/fa'; // Ícone para importação
import { FileUp, X, Save, Plus, Settings, Code, ArrowRight, Check, AlertCircle, HelpCircle } from 'lucide-react';

// Métodos JavaScript nativos permitidos
const jsMethods = {
  object: [
    { label: 'Object.keys()', detail: 'Retorna array com chaves', apply: 'Object.keys()' },
    { label: 'Object.values()', detail: 'Retorna array com valores', apply: 'Object.values()' },
    { label: 'Object.entries()', detail: 'Retorna array [key, value]', apply: 'Object.entries()' },
    { label: 'Object.assign()', detail: 'Mesclar objetos', apply: 'Object.assign({}, )' },
    { label: 'hasOwnProperty()', detail: 'Verificar se propriedade existe', apply: 'hasOwnProperty()' }
  ],
  string: [
    { label: 'toLowerCase()', detail: 'Converter para minúsculas', apply: 'toLowerCase()' },
    { label: 'toUpperCase()', detail: 'Converter para maiúsculas', apply: 'toUpperCase()' },
    { label: 'trim()', detail: 'Remover espaços', apply: 'trim()' },
    { label: 'split()', detail: 'Dividir string', apply: "split('')" },
    { label: 'replace()', detail: 'Substituir texto', apply: "replace('', '')" },
    { label: 'match()', detail: 'Match com regex', apply: 'match(//)' },
    { label: 'includes()', detail: 'Verificar se contém', apply: "includes('')" },
    { label: 'startsWith()', detail: 'Verifica início', apply: "startsWith('')" },
    { label: 'endsWith()', detail: 'Verifica fim', apply: "endsWith('')" },
    { label: 'substring()', detail: 'Extrair substring', apply: 'substring(0, 5)' }
  ],
  array: [
    { label: 'push()', detail: 'Adicionar ao final', apply: 'push()' },
    { label: 'pop()', detail: 'Remover do final', apply: 'pop()' },
    { label: 'shift()', detail: 'Remover do início', apply: 'shift()' },
    { label: 'unshift()', detail: 'Adicionar ao início', apply: 'unshift()' },
    { label: 'map()', detail: 'Transformar array', apply: 'map(item => item)' },
    { label: 'filter()', detail: 'Filtrar array', apply: 'filter(item => true)' },
    { label: 'find()', detail: 'Encontrar item', apply: 'find(item => true)' },
    { label: 'forEach()', detail: 'Iterar array', apply: 'forEach(item => {})' },
    { label: 'join()', detail: 'Juntar em string', apply: "join('')" },
    { label: 'includes()', detail: 'Verificar existência', apply: 'includes()' }
  ]
};

// Nova API Unificada - Objeto data
const customMethods = {
  data: [
    // Método HTTP
    { label: 'data.getMethod()', type: 'method', detail: 'Obter método HTTP da requisição', apply: 'getMethod()', info: 'Retorna: "GET", "POST", etc' },
    { label: 'data.setMethod(method)', type: 'method', detail: 'Mudar método HTTP para destino', apply: 'setMethod("")', info: 'Ex: data.setMethod("PUT")' },

    // Código de Resposta
    { label: 'data.responseCode(code)', type: 'method', detail: 'Definir código de resposta', apply: 'responseCode()', info: 'Ex: data.responseCode(200)' },

    // Headers
    { label: 'data.getHeaders()', type: 'method', detail: 'Obter todos os headers', apply: 'getHeaders()', info: 'Retorna objeto com headers' },
    { label: 'data.setHeader(key, value)', type: 'method', detail: 'Definir header', apply: 'setHeader("", "")', info: 'Ex: data.setHeader("X-Custom", "value")' },
    { label: 'data.setHeader(obj)', type: 'method', detail: 'Definir múltiplos headers', apply: 'setHeader({})', info: 'Ex: data.setHeader({ "X-A": "1" })' },
    { label: 'data.removeHeader(key)', type: 'method', detail: 'Remover header', apply: 'removeHeader("")', info: 'Ex: data.removeHeader("X-Temp")' },

    // Rota de Entrada
    { label: 'data.getRoute()', type: 'method', detail: 'Obter info da rota de entrada', apply: 'getRoute()', info: 'Retorna: { method, url, uri, protocol, host, params, query, headers }' },

    // Rota de Destino
    { label: 'data.getDestRoute()', type: 'method', detail: 'Obter info da rota de destino', apply: 'getDestRoute()', info: 'Retorna configurações da URL de destino' },
    { label: 'data.setDestRoute(config)', type: 'method', detail: 'Modificar URL de destino', apply: 'setDestRoute({})', info: 'Ex: data.setDestRoute({ addPath: "/v2" })' },

    // Body
    { label: 'data.getBody()', type: 'method', detail: 'Obter body da requisição', apply: 'getBody()', info: 'Retorna body (query ou POST body)' },
    { label: 'data.setBody(body)', type: 'method', detail: 'Definir novo body', apply: 'setBody()', info: 'Ex: data.setBody({ ...body, page: 1 })' },

    // Storage Persistente
    { label: 'data.getStorage(key)', type: 'method', detail: 'Obter valor do storage (async)', apply: 'getStorage("")', info: 'Ex: await data.getStorage("config")' },
    { label: 'data.setStorage(key, value)', type: 'method', detail: 'Salvar no storage (async, max 5MB)', apply: 'setStorage("", )', info: 'Ex: await data.setStorage("key", value)' },
    { label: 'data.delStorage(key)', type: 'method', detail: 'Deletar do storage (async)', apply: 'delStorage("")', info: 'Ex: await data.delStorage("key")' },

    // Exceção
    { label: 'data.Exception(msg, code)', type: 'method', detail: 'Barrar requisição com erro', apply: 'Exception("", 400)', info: 'Ex: data.Exception("Erro", 401)' },

    // Resposta
    { label: 'data.onResponse(callback)', type: 'method', detail: 'Callback para processar resposta', apply: 'onResponse(() => {})', info: 'Ex: data.onResponse(() => { ... })' },
    { label: 'data.setResponse(response)', type: 'method', detail: 'Definir nova resposta', apply: 'setResponse({})', info: 'Ex: data.setResponse({ body, headers })' },

    // Fetch
    { label: 'data.fetch(url, options)', type: 'method', detail: 'Requisição HTTP assíncrona', apply: 'fetch("", {})', info: 'Ex: await data.fetch(url, { method: "POST" })' },

    // Contexto
    { label: 'data.ctx', type: 'property', detail: 'Contexto compartilhado entre etapas', apply: 'ctx', info: 'Ex: data.ctx.userId = 123' }
  ],
  'data.ctx': [
    { label: 'userId', type: 'property', detail: 'ID do usuário (exemplo)', apply: 'userId', info: 'Acesse/defina: data.ctx.userId' },
    { label: 'token', type: 'property', detail: 'Token (exemplo)', apply: 'token', info: 'Acesse/defina: data.ctx.token' },
    { label: 'apiKey', type: 'property', detail: 'API Key (exemplo)', apply: 'apiKey', info: 'Acesse/defina: data.ctx.apiKey' }
  ]
};

// Funções globais permitidas - Expandido
const globalFunctions = [
  // Console e Debug
  { label: 'console.log()', type: 'function', detail: 'Log no console', apply: 'console.log()' },
  { label: 'console.error()', type: 'function', detail: 'Log de erro', apply: 'console.error()' },
  { label: 'console.warn()', type: 'function', detail: 'Log de aviso', apply: 'console.warn()' },

  // JSON
  { label: 'JSON.parse()', type: 'function', detail: 'Parsear JSON', apply: 'JSON.parse()' },
  { label: 'JSON.stringify()', type: 'function', detail: 'Converter para JSON', apply: 'JSON.stringify()' },
  { label: 'JSON.stringify(obj, null, 2)', type: 'function', detail: 'JSON formatado', apply: 'JSON.stringify(obj, null, 2)' },

  // Conversão de Tipos
  { label: 'parseInt()', type: 'function', detail: 'Converter para inteiro', apply: 'parseInt()' },
  { label: 'parseFloat()', type: 'function', detail: 'Converter para float', apply: 'parseFloat()' },
  { label: 'String()', type: 'function', detail: 'Converter para string', apply: 'String()' },
  { label: 'Number()', type: 'function', detail: 'Converter para número', apply: 'Number()' },
  { label: 'Boolean()', type: 'function', detail: 'Converter para boolean', apply: 'Boolean()' },

  // Array
  { label: 'Array.isArray()', type: 'function', detail: 'Verificar se é array', apply: 'Array.isArray()' },
  { label: 'Array.from()', type: 'function', detail: 'Criar array de iterável', apply: 'Array.from()' },

  // Date e Time
  { label: 'Date.now()', type: 'function', detail: 'Timestamp atual (ms)', apply: 'Date.now()' },
  { label: 'new Date()', type: 'function', detail: 'Criar objeto Date', apply: 'new Date()' },
  { label: 'new Date().toISOString()', type: 'function', detail: 'Data em ISO 8601', apply: 'new Date().toISOString()' },

  // Math
  { label: 'Math.random()', type: 'function', detail: 'Número aleatório 0-1', apply: 'Math.random()' },
  { label: 'Math.floor()', type: 'function', detail: 'Arredondar para baixo', apply: 'Math.floor()' },
  { label: 'Math.ceil()', type: 'function', detail: 'Arredondar para cima', apply: 'Math.ceil()' },
  { label: 'Math.round()', type: 'function', detail: 'Arredondar', apply: 'Math.round()' },
  { label: 'Math.abs()', type: 'function', detail: 'Valor absoluto', apply: 'Math.abs()' },
  { label: 'Math.max()', type: 'function', detail: 'Valor máximo', apply: 'Math.max()' },
  { label: 'Math.min()', type: 'function', detail: 'Valor mínimo', apply: 'Math.min()' },

  // Buffer e Encoding
  { label: 'Buffer.from(str, "utf8")', type: 'function', detail: 'Criar Buffer de string', apply: 'Buffer.from(str, "utf8")' },
  { label: 'Buffer.from(str, "base64")', type: 'function', detail: 'Buffer de Base64', apply: 'Buffer.from(str, "base64")' },
  { label: 'buffer.toString("base64")', type: 'function', detail: 'Converter para Base64', apply: 'buffer.toString("base64")' },
  { label: 'buffer.toString("utf8")', type: 'function', detail: 'Converter para UTF-8', apply: 'buffer.toString("utf8")' },

  // Controle de Fluxo
  { label: 'throw new Error()', type: 'keyword', detail: 'Lançar erro', apply: "throw new Error('')" },
  { label: 'return', type: 'keyword', detail: 'Retornar valor', apply: 'return ' },
  { label: 'if (condition) {}', type: 'keyword', detail: 'Condicional if', apply: 'if () {\n  \n}' },
  { label: 'try {} catch (e) {}', type: 'keyword', detail: 'Tratamento de erro', apply: 'try {\n  \n} catch (e) {\n  \n}' },

  // Regex
  { label: 'new RegExp()', type: 'function', detail: 'Criar expressão regular', apply: 'new RegExp()' },
  { label: 'str.match(/pattern/)', type: 'function', detail: 'Match com regex', apply: 'str.match(//)' },
  { label: 'str.test(/pattern/)', type: 'function', detail: 'Testar regex', apply: 'str.test(//)' }
];

// Autocompletion customizado avançado e robusto
const createCompletions = (type) => {
  return (context) => {
    const textBefore = context.state.doc.sliceString(0, context.pos);

    // Detectar se está dentro de colchetes para sugerir chaves comuns
    const bracketMatch = textBefore.match(/(\w+)\[['"](\w*)$/);
    if (bracketMatch) {
      const [, varName] = bracketMatch;
      const keysSuggestions = [];

      if (varName === 'headers' || varName === 'responseHeaders') {
        keysSuggestions.push(
          { label: "'Authorization'", type: 'text', detail: 'Token de auth', apply: "'Authorization']" },
          { label: "'Content-Type'", type: 'text', detail: 'Tipo de conteúdo', apply: "'Content-Type']" },
          { label: "'Accept'", type: 'text', detail: 'Formatos aceitos', apply: "'Accept']" },
          { label: "'User-Agent'", type: 'text', detail: 'Cliente', apply: "'User-Agent']" },
          { label: "'X-API-Key'", type: 'text', detail: 'API Key customizada', apply: "'X-API-Key']" }
        );
      } else if (varName === 'params' || varName === 'route') {
        keysSuggestions.push(
          { label: "'id'", type: 'text', detail: 'ID comum', apply: "'id']" },
          { label: "'userId'", type: 'text', detail: 'ID de usuário', apply: "'userId']" },
          { label: "'name'", type: 'text', detail: 'Nome', apply: "'name']" }
        );
      }

      return {
        from: context.pos,
        options: keysSuggestions,
        validFor: /^[\w'"]*$/
      };
    }

    // Detectar chamadas de função encadeadas: route.out().
    const functionChainMatch = textBefore.match(/(\w+)\.(\w+)\(\)\.(\w*)$/);
    if (functionChainMatch) {
      const [, parent, func, prefix] = functionChainMatch;
      const chainKey = `${parent}.${func}()`;

      let suggestions = [...(customMethods[chainKey] || [])];

      return {
        from: context.pos - prefix.length,
        options: suggestions,
        validFor: /^\w*$/
      };
    }

    // Detectar propriedades encadeadas (route.params., route.query_params., etc)
    const chainedMatch = textBefore.match(/(\w+)\.(\w+)\.(\w*)$/);
    if (chainedMatch) {
      const [, parent, property, prefix] = chainedMatch;
      const chainKey = `${parent}.${property}`;

      let suggestions = [...(customMethods[chainKey] || [])];

      // Se for route.params, mostrar propriedades comuns
      if (chainKey === 'route.params') {
        suggestions.push(
          { label: 'wildcard', type: 'property', detail: 'Path capturado pelo wildcard *', apply: 'wildcard' },
          { label: 'id', type: 'property', detail: 'ID capturado', apply: 'id' },
          { label: 'userId', type: 'property', detail: 'User ID capturado', apply: 'userId' }
        );
      }

      // Adicionar métodos JavaScript nativos apropriados
      if (property === 'path' || property === 'method') {
        suggestions.push(...jsMethods.string);
      }

      return {
        from: context.pos - prefix.length,
        options: suggestions,
        validFor: /^\w*$/
      };
    }

    // Detectar se está acessando propriedade com ponto (route., ctx., headers., params.)
    const dotMatch = textBefore.match(/(\w+)\.(\w*)$/);
    if (dotMatch) {
      const [, varName, prefix] = dotMatch;
      let suggestions = [...(customMethods[varName] || [])];

      // Adicionar métodos de string para propriedades que são string
      if (varName === 'route' && ['path', 'method'].some(p => prefix.startsWith(p))) {
        suggestions.push(...jsMethods.string);
      }

      // Detectar se é resultado de Object.keys/values/entries (array)
      if (textBefore.match(/Object\.(keys|values|entries)\([^)]*\)\./)) {
        suggestions.push(...jsMethods.array);
      }

      // Adicionar métodos de objeto para todos
      suggestions.push(...jsMethods.object);

      return {
        from: context.pos - prefix.length,
        options: suggestions,
        validFor: /^\w*$/
      };
    }

    // Detectar se está depois de toString() para sugerir métodos de string
    if (textBefore.match(/\.toString\([^)]*\)\./)) {
      return {
        from: context.pos,
        options: jsMethods.string,
        validFor: /^\w*$/
      };
    }

    // Autocompletion geral
    const word = context.matchBefore(/\w+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    const baseCompletions = {
      headers: [
        { label: 'headers', type: 'variable', detail: 'Objeto com headers da requisição', info: 'Acesse: headers["Authorization"], headers["Content-Type"]' },
        { label: 'ctx', type: 'variable', detail: 'Contexto compartilhado entre etapas', info: 'Defina valores: ctx.userId = 123, ctx.token = "abc"' },
        { label: 'route', type: 'variable', detail: 'Informações da rota atual', info: 'Props: url, uri, method, protocol, params, query_params' }
      ],
      params: [
        { label: 'params', type: 'variable', detail: 'Parâmetros query ou body', info: 'Acesse: params["id"], params["page"]' },
        { label: 'ctx', type: 'variable', detail: 'Contexto compartilhado', info: 'Acesse: ctx.userId, ctx.token, ctx.apiKey' },
        { label: 'route', type: 'variable', detail: 'Informações da rota', info: 'Props: url, uri, method, params, query_params' }
      ],
      response: [
        { label: 'responseBody', type: 'variable', detail: 'Buffer com corpo da resposta', info: 'Use: responseBody.toString(), responseBody.length' },
        { label: 'responseHeaders', type: 'variable', detail: 'Headers da resposta da API', info: 'Acesse/modifique: responseHeaders["Content-Type"]' },
        { label: 'ctx', type: 'variable', detail: 'Contexto de etapas anteriores', info: 'Acesse dados salvos em etapas anteriores' },
        { label: 'route', type: 'variable', detail: 'Informações da rota', info: 'Props: url, uri, method, params, query_params' },
        { label: 'const data = ', type: 'keyword', detail: 'Criar variável', apply: 'const data = ' }
      ]
    };

    const allOptions = [
      ...(baseCompletions[type] || []),
      ...globalFunctions,
      ...customMethods.headers,
      ...customMethods.params,
      ...customMethods.responseBody,
      ...customMethods.responseHeaders,
      ...customMethods.route,
      ...customMethods.ctx
    ];

    return {
      from: word.from,
      options: allOptions,
      validFor: /^\w*$/
    };
  };
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
    nome: '', custom_route: '', url_destino: '', metodo: ['GET'], // Agora é array
    slug: '', // Adicionado slug
    headers_in_config: {}, // Drop removido
    headers_out_config: {}, // Drop removido
    params_config: { type: 'query' }, // Drop removido
    headers_validator_script: '// Modifique headers, valide ou manipule a requisição de entrada\n// Exemplo: Extrair API key e salvar no contexto\nconst apiKey = data.getHeaders()[\'x-api-key\'];\nif (apiKey) {\n  data.ctx.apiKey = apiKey;\n}\n\n// Exemplo: Remover headers indesejados\n// data.removeHeader(\'x-internal-header\');\n\n// Exemplo: Modificar rota de destino\n// data.setDestRoute({ addPath: \'/v2\' });\n\n// Exemplo: Bloquear requisição\n// if (!apiKey) data.Exception(\'API Key obrigatória\', 401);',
    params_validator_script: '// Modifique/valide parâmetros (query ou body)\nconst body = data.getBody();\nconst route = data.getRoute();\n\n// Exemplo: Validar parâmetro obrigatório\n// if (!body.userId) data.Exception(\'userId obrigatório\', 400);\n\n// Exemplo: Adicionar valores padrão\n// if (!body.page) data.setBody({ ...body, page: 1 });\n\n// Exemplo: Usar storage persistente\n// const config = await data.getStorage(\'config\');\n// console.log(\'Config salva:\', config);',
    response_script: '// Manipule a resposta da API externa antes de enviar ao cliente\nconst route = data.getRoute();\n\n// Exemplo: Processar resposta\n// data.onResponse(async () => {\n//   const body = data.getBody();\n//   const json = JSON.parse(body.toString());\n//   \n//   // Adicionar metadados\n//   json._meta = { processedAt: new Date().toISOString() };\n//   \n//   data.setResponse({\n//     body: Buffer.from(JSON.stringify(json)),\n//     headers: { \'Content-Type\': \'application/json\' }\n//   });\n//   \n//   // Mudar código de resposta\n//   data.responseCode(200);\n// });',
  };

  const [formData, setFormData] = useState(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [importedConfig, setImportedConfig] = useState(null);
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('headers');
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const apiUrl = import.meta.env?.VITE_API_URL || 'http://localhost:3001';
  const baseUrl = apiUrl.replace('/api', ''); // Remove '/api' se existir

  useEffect(() => {
    if (isOpen) {
      if (isEditing && forwardData) {
        setFormData({
          ...initialFormData, ...forwardData,
          // Converte método único para array se necessário
          metodo: Array.isArray(forwardData.metodo) ? forwardData.metodo : [forwardData.metodo],
          // Garante que configs sejam objetos e scripts sejam strings
          headers_in_config: parseJsonConfig(forwardData.headers_in_config, {}),
          headers_out_config: parseJsonConfig(forwardData.headers_out_config, {}),
          params_config: parseJsonConfig(forwardData.params_config, {
            type: (forwardData.metodo === 'GET' || (Array.isArray(forwardData.metodo) && forwardData.metodo.includes('GET'))) ? 'query' : 'body'
          }),
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

  const handleMetodoChange = (metodo) => {
    setFormData(prev => {
      const metodosAtuais = [...prev.metodo];
      const index = metodosAtuais.indexOf(metodo);

      if (index > -1) {
        // Remove se já existe
        metodosAtuais.splice(index, 1);
      } else {
        // Adiciona se não existe
        metodosAtuais.push(metodo);
      }

      // Ajusta params_config baseado nos métodos selecionados
      const hasBodyMethod = metodosAtuais.some(m => ['POST', 'PUT', 'PATCH'].includes(m));

      return {
        ...prev,
        metodo: metodosAtuais.length > 0 ? metodosAtuais : ['GET'], // Mantém pelo menos GET
        params_config: {
          ...(prev.params_config || {}),
          type: hasBodyMethod ? 'body' : 'query'
        }
      };
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newState = { ...prev, [name]: value };

      // Auto-gera slug a partir do nome
      if (name === 'nome' && value) {
        newState.slug = value.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
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

  // Validação simplificada: apenas impede script vazio (assinatura não é mais exigida)
  const validateScriptSignature = (script) => {
    if (!script || script.trim() === '') return { valid: true };
    // Opcional: pode adicionar validação de tamanho/mínimo de conteúdo
    return { valid: true };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validar scripts
      const headersValidation = validateScriptSignature(formData.headers_validator_script);
      if (!headersValidation.valid) {
        throw new Error(`Script de Headers: ${headersValidation.message}`);
      }

      const paramsValidation = validateScriptSignature(formData.params_validator_script);
      if (!paramsValidation.valid) {
        throw new Error(`Script de Parâmetros: ${paramsValidation.message}`);
      }

      const responseValidation = validateScriptSignature(formData.response_script);
      if (!responseValidation.valid) {
        throw new Error(`Script de Resposta: ${responseValidation.message}`);
      }

      const dataToSend = {
        ...formData,
        custom_route: formData.custom_route || null,
        // Garante que configs sejam strings JSON ao enviar
        // IMPORTANTE: metodo também é enviado como JSON string para suportar múltiplos métodos
        metodo: JSON.stringify(formData.metodo || ['GET']),
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
    <dialog id="forward_modal" className="modal modal-open bg-black bg-opacity-60">
      <div className="modal-box w-11/12 max-w-6xl animate-scale-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-base-300">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <div className="bg-warning/10 p-3 rounded-full">
                <Settings className="w-6 h-6 text-warning" />
              </div>
            ) : (
              <div className="bg-primary/10 p-3 rounded-full">
                <Plus className="w-6 h-6 text-primary" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-2xl">{isEditing ? 'Editar Forward' : 'Novo Forward'}</h3>
              <p className="text-sm opacity-70">Configure o encaminhamento de API</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-circle btn-ghost hover-lift"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div role="alert" className="alert alert-error mb-4 shadow-lg animate-shake">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          )}

          {/* Campos Principais */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-4 mb-4">
            {/* Nome Identificador */}
            <div className="flex flex-col">
              <div className="form-control w-full">
                <label className="label pb-1">
                  <span className="label-text font-semibold">Nome Identificador *</span>
                </label>
                <input
                  type="text"
                  name="nome"
                  placeholder="Ex: openai-api"
                  className="input input-bordered w-full"
                  value={formData.nome}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
                <div className="label pt-1 pb-0">
                  <span className="label-text-alt text-xs opacity-70">
                    Identificador único para este forward. Usado para gerar o slug da rota.
                  </span>
                </div>
              </div>
            </div>

            {/* Métodos HTTP Múltiplos */}
            <div className="flex flex-col">
              <div className="form-control w-full">
                <label className="label pb-1">
                  <span className="label-text font-semibold">Métodos HTTP * (múltipla seleção)</span>
                </label>
                <div className="flex flex-wrap gap-2 p-3 border border-base-300 rounded-lg bg-base-200">
                  {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((metodo) => (
                    <label
                      key={metodo}
                      className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${formData.metodo.includes(metodo)
                        ? 'bg-primary text-primary-content border-primary shadow-md'
                        : 'bg-base-100 border-base-300 hover:border-primary'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.metodo.includes(metodo)}
                        onChange={() => handleMetodoChange(metodo)}
                        disabled={loading}
                        className="checkbox checkbox-xs"
                      />
                      <span className="text-sm font-medium">{metodo}</span>
                    </label>
                  ))}
                </div>
                <div className="label pt-1 pb-0">
                  <span className="label-text-alt text-xs opacity-70">
                    Selecione um ou mais métodos HTTP que este forward deve aceitar.
                  </span>
                </div>
              </div>
            </div>
            {/* URL de Destino */}
            <div className="flex flex-col lg:col-span-2">
              <div className="form-control w-full">
                <label className="label pb-1">
                  <span className="label-text font-semibold">URL de Destino (API Externa) *</span>
                </label>
                <input
                  type="text"
                  name="url_destino"
                  placeholder="https://api.openai.com/"
                  className="input input-bordered w-full"
                  value={formData.url_destino}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
                <div className="label pt-1 pb-0">
                  <span className="label-text-alt text-xs opacity-70">
                    URL base da API externa. O caminho capturado pela rota wildcard (*) será automaticamente anexado a esta URL.
                    Suporta variáveis com chaves {'{}'} (ex: <code className="bg-base-300 px-1 rounded">https://api.exemplo.com/{'{userId}'}/</code>).
                  </span>
                </div>
              </div>
            </div>

            {/* Rota Customizada */}
            <div className="flex flex-col lg:col-span-2">
              <div className="form-control w-full">
                <label className="label pb-1">
                  <span className="label-text font-semibold">Rota Customizada (Opcional)</span>
                </label>
                <input
                  type="text"
                  name="custom_route"
                  placeholder="/v1/chat/completions"
                  className="input input-bordered w-full"
                  value={formData.custom_route || ''}
                  onChange={handleChange}
                  disabled={loading}
                />
                <div className="label pt-1 pb-0">
                  <span className="label-text-alt text-xs opacity-70">
                    Define um prefixo adicional para a rota após o slug. Se deixado vazio, a rota será apenas /{'{slug}'}/*.
                    Suporta parâmetros dinâmicos (ex: <code className="bg-base-300 px-1 rounded">/users/{'{userId}'}</code>).
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Preview da Rota Final */}
          {formData.nome && (
            <div className="alert shadow-lg mb-6 bg-info/10 border-info/30 animate-fade-in">
              <div className="w-full">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRight className="w-5 h-5 text-info" />
                  <h4 className="font-bold text-info">Preview da Rota</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm opacity-70">Métodos:</span>
                    {formData.metodo.map(m => (
                      <span key={m} className="badge badge-primary badge-sm">{m}</span>
                    ))}
                  </div>
                  <div className="font-mono text-sm bg-base-300 p-3 rounded-lg">
                    <span className="opacity-70">{!baseUrl.endsWith('/') ? baseUrl + '/' : baseUrl}</span>
                    <span className="text-primary font-bold">{formData.slug || '[slug]'}</span>
                    {formData.custom_route && formData.custom_route.trim() !== '' && (
                      <span className="text-secondary">{formData.custom_route.startsWith('/') ? formData.custom_route : '/' + formData.custom_route}</span>
                    )}
                    <span className="opacity-70">/*</span>
                  </div>
                  <div className="text-xs opacity-60">
                    O <code className="bg-base-300 px-1 rounded">/*</code> captura qualquer sub-rota e encaminha para a URL de destino.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Configurações Avançadas - Tabs controladas por estado React */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-secondary/10 p-2 rounded-lg">
                  <Code className="w-5 h-5 text-secondary" />
                </div>
                <h3 className="text-lg font-semibold">Configurações Avançadas</h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-2 hover-lift"
                onClick={() => setIsDocsOpen(true)}
                title="Documentação dos métodos"
              >
                <HelpCircle className="w-4 h-4" />
                Docs
              </button>
            </div>

            <div role="tablist" className="tabs tabs-boxed bg-base-200 mb-3 p-1">
              <button
                type="button"
                className={`tab gap-2 transition-all ${activeTab === 'headers' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('headers')}
              >
                <ArrowRight className="w-4 h-4" />
                Headers de Entrada
              </button>
              <button
                type="button"
                className={`tab gap-2 transition-all ${activeTab === 'params' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('params')}
              >
                <Settings className="w-4 h-4" />
                Parâmetros
              </button>
              <button
                type="button"
                className={`tab gap-2 transition-all ${activeTab === 'response' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('response')}
              >
                <Code className="w-4 h-4" />
                Resposta
              </button>
            </div>

            <div className="bg-base-200/50 border border-base-300 rounded-box p-4 animate-fade-in">
              {activeTab === 'headers' && (
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs">Script Validador/Modificador de Headers (JS):</span></label>
                  <div className="alert alert-info shadow-sm mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs">
                      Digite apenas o <b>corpo do script</b>. O objeto <code className="bg-base-300 text-secondary px-1 rounded">data</code> já está disponível.<br />
                      <b>Exemplo:</b> <code className="bg-base-300 text-secondary px-1 rounded">const headers = data.getHeaders(); delete headers['authorization']; data.setHeader(headers);</code>
                    </span>
                  </div>
                  <div className="border border-base-300 rounded-lg overflow-hidden">
                    <CodeMirror
                      value={formData.headers_validator_script}
                      onChange={(value) => handleScriptChange('headers_validator_script', value)}
                      extensions={[
                        javascript(),
                        autocompletion({ override: [createCompletions('headers')] })
                      ]}
                      minHeight="200px"
                      maxHeight="400px"
                      theme="dark"
                      basicSetup={{
                        lineNumbers: true,
                        highlightActiveLineGutter: true,
                        highlightSpecialChars: true,
                        foldGutter: true,
                        drawSelection: true,
                        dropCursor: true,
                        allowMultipleSelections: true,
                        indentOnInput: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: true,
                        rectangularSelection: true,
                        highlightActiveLine: true,
                        highlightSelectionMatches: true
                      }}
                    />
                  </div>
                </div>
              )}
              {activeTab === 'params' && (
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs">Script Validador/Modificador de Parâmetros (JS):</span></label>
                  <div className="alert alert-info shadow-sm mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs">
                      Digite apenas o <b>corpo do script</b>. O objeto <code className="bg-base-300 text-secondary px-1 rounded">data</code> já está disponível.<br />
                      <b>Exemplo:</b> <code className="bg-base-300 text-secondary px-1 rounded">let body = JSON.parse(data.getBody()); if (!body?.model) &#123; body.model = 'gpt-5'; data.setBody(body); &#125;</code>
                    </span>
                  </div>
                  <div className="border border-base-300 rounded-lg overflow-hidden">
                    <CodeMirror
                      value={formData.params_validator_script}
                      onChange={(value) => handleScriptChange('params_validator_script', value)}
                      extensions={[
                        javascript(),
                        autocompletion({ override: [createCompletions('params')] })
                      ]}
                      minHeight="200px"
                      maxHeight="400px"
                      theme="dark"
                      basicSetup={{
                        lineNumbers: true,
                        highlightActiveLineGutter: true,
                        highlightSpecialChars: true,
                        foldGutter: true,
                        drawSelection: true,
                        dropCursor: true,
                        allowMultipleSelections: true,
                        indentOnInput: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: true,
                        rectangularSelection: true,
                        highlightActiveLine: true,
                        highlightSelectionMatches: true
                      }}
                    />
                  </div>
                </div>
              )}
              {activeTab === 'response' && (
                <div className="form-control">
                  <label className="label py-1"><span className="label-text text-xs">Script Manipulador da Resposta (JS):</span></label>
                  <div className="alert alert-info shadow-sm mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs">
                      Digite apenas o <b>corpo do script</b>. O objeto <code className="bg-base-300 text-secondary px-1 rounded">data</code> já está disponível.<br />
                      <b>Exemplo:</b>{' '}
                      <code className="bg-base-300 text-secondary px-1 rounded">
                        {"data.onResponse((response) => { data.responseCode(200); data.setResponse(/* ... */); });"}
                      </code>
                    </span>
                  </div>
                  <div className="border border-base-300 rounded-lg overflow-hidden">
                    <CodeMirror
                      value={formData.response_script}
                      onChange={(value) => handleScriptChange('response_script', value)}
                      extensions={[
                        javascript(),
                        autocompletion({ override: [createCompletions('response')] })
                      ]}
                      minHeight="200px"
                      maxHeight="400px"
                      theme="dark"
                      basicSetup={{
                        lineNumbers: true,
                        highlightActiveLineGutter: true,
                        highlightSpecialChars: true,
                        foldGutter: true,
                        drawSelection: true,
                        dropCursor: true,
                        allowMultipleSelections: true,
                        indentOnInput: true,
                        bracketMatching: true,
                        closeBrackets: true,
                        autocompletion: true,
                        rectangularSelection: true,
                        highlightActiveLine: true,
                        highlightSelectionMatches: true
                      }}
                    />
                  </div>
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
          <div className="modal-action mt-8 pt-4 border-t border-base-300">
            <button
              type="button"
              className="btn btn-secondary btn-outline gap-2 hover-lift"
              onClick={handleImportClick}
              disabled={loading}
            >
              <FileUp className="w-4 h-4" />
              Importar JSON
            </button>
            <div className="flex-1"></div>
            <button
              type="button"
              className="btn btn-ghost gap-2"
              onClick={onClose}
              disabled={loading}
            >
              <X className="w-4 h-4" />
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary gap-2 shadow-lg hover-lift"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Salvando...
                </>
              ) : (
                <>
                  {isEditing ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isEditing ? 'Salvar Alterações' : 'Criar Forward'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Diálogo de confirmação para importação */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-base-100 p-6 rounded-lg shadow-2xl max-w-md w-full border border-base-300 animate-scale-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-warning/10 p-3 rounded-full">
                <AlertCircle className="w-6 h-6 text-warning" />
              </div>
              <h3 className="font-bold text-xl">Confirmar Importação</h3>
            </div>
            <p className="mb-6 text-sm opacity-80">
              A configuração atual será substituída pelos dados importados. Esta ação não pode ser desfeita.
              Deseja continuar?
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost gap-2"
                onClick={handleCancelImport}
              >
                <X className="w-4 h-4" />
                Cancelar
              </button>
              <button
                className="btn btn-warning gap-2 hover-lift"
                onClick={handleConfirmImport}
              >
                <Check className="w-4 h-4" />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Documentação dos Métodos */}
      {isDocsOpen && (
        <dialog className="modal modal-open bg-black bg-opacity-60">
          <div className="modal-box w-11/12 max-w-5xl animate-scale-in shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-base-300">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <HelpCircle className="w-5 h-5" />
                Documentação dos Métodos (Sandbox: data)
              </h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setIsDocsOpen(false)}>
                <X className="w-4 h-4" />
                Fechar
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              {/* Sidebar de navegação */}
              <nav className="hidden md:block w-56 shrink-0 sticky top-0 self-start bg-base-100 border-r border-base-300 rounded-lg p-4 h-fit">
                <h4 className="font-bold mb-2 text-base">Sumário</h4>
                <ul className="space-y-2 text-sm">
                  <li><a href="#visao-geral" className="hover:underline text-primary">Visão Geral</a></li>
                  <li><a href="#metodo-http" className="hover:underline">Método HTTP</a></li>
                  <li><a href="#headers" className="hover:underline">Headers</a></li>
                  <li><a href="#rota" className="hover:underline">Rota</a></li>
                  <li><a href="#body" className="hover:underline">Body/Parâmetros</a></li>
                  <li><a href="#storage" className="hover:underline">Storage</a></li>
                  <li><a href="#excecao" className="hover:underline">Exceção</a></li>
                  <li><a href="#resposta" className="hover:underline">Resposta</a></li>
                  <li><a href="#fetch" className="hover:underline">Fetch</a></li>
                  <li><a href="#exemplos" className="hover:underline">Exemplos</a></li>
                </ul>
              </nav>
              {/* Conteúdo principal */}
              <div className="prose max-w-none text-sm flex-1">
                <section id="visao-geral" className="mb-8">
                  <h4 className="mt-0">Visão Geral</h4>
                  <p>
                    Nos scripts (Headers, Parâmetros, Resposta), escreva apenas o corpo. O objeto <code>data</code> está disponível com métodos utilitários.
                  </p>
                </section>

                <section id="metodo-http" className="mb-8">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-info badge-sm">Método HTTP</span>
                  </h4>
                  <div className="grid gap-2">
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.getMethod()</span>
                      <span className="ml-2 text-xs opacity-70">Retorna o método HTTP atual.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.setMethod("PUT")</span>
                      <span className="ml-2 text-xs opacity-70">Altera o método da requisição encaminhada.</span>
                    </div>
                  </div>
                </section>

                <section id="headers" className="mb-8">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-info badge-sm">Headers</span>
                  </h4>
                  <div className="grid gap-2">
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.getHeaders()</span>
                      <span className="ml-2 text-xs opacity-70">Retorna um objeto com os headers recebidos.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.setHeader("X-A", "1")</span>
                      <span className="ml-2 text-xs opacity-70">Define header individual.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">{'data.setHeader({ "X-A": "1" })'}</span>
                      <span className="ml-2 text-xs opacity-70">Define múltiplos headers.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.removeHeader("Authorization")</span>
                      <span className="ml-2 text-xs opacity-70">Remove header.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.removeHeader(["Authorization","X-B"])</span>
                      <span className="ml-2 text-xs opacity-70">Remove múltiplos headers.</span>
                    </div>
                  </div>
                </section>

                <section id="rota" className="mb-8">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-info badge-sm">Rota (Entrada e Destino)</span>
                  </h4>
                  <div className="grid gap-2">
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.getRoute()</span>
                      <span className="ml-2 text-xs opacity-70">{`{ method, url, uri, protocol, host, params, query, headers }`}</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.getDestRoute()</span>
                      <span className="ml-2 text-xs opacity-70">Retorna modificações planejadas para a URL de destino.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">{'data.setDestRoute({ url, addPath, replaceVars, removePath, query, appendQuery, filter, method })'}</span>
                      <span className="ml-2 text-xs opacity-70">Ajusta a URL alvo.</span>
                    </div>
                  </div>
                </section>

                <section id="body" className="mb-8">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-info badge-sm">Body/Parâmetros</span>
                  </h4>
                  <div className="grid gap-2">
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.getBody()</span>
                      <span className="ml-2 text-xs opacity-70">Retorna body (ou query) conforme a etapa.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.setBody(novoBody)</span>
                      <span className="ml-2 text-xs opacity-70">Altera body (ou query) a ser enviado.</span>
                    </div>
                  </div>
                </section>

                <section id="storage" className="mb-8">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-info badge-sm">Storage</span>
                  </h4>
                  <div className="grid gap-2">
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">await data.getStorage("key")</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">await data.setStorage("key", value)</span>
                      <span className="ml-2 text-xs opacity-70">Limite ~5MB por chave.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">await data.delStorage("key")</span>
                    </div>
                  </div>
                </section>

                <section id="excecao" className="mb-8">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-error badge-sm">Exceção</span>
                  </h4>
                  <div className="bg-base-200 rounded-lg p-3">
                    <span className="font-mono text-xs">data.Exception("Mensagem", 400)</span>
                    <span className="ml-2 text-xs opacity-70">Interrompe imediatamente e responde com status informado.</span>
                  </div>
                </section>

                <section id="resposta" className="mb-8">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-info badge-sm">Resposta</span>
                  </h4>
                  <div className="grid gap-2">
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">{'data.onResponse((response) => { /* ... */ })'}</span>
                      <span className="ml-2 text-xs opacity-70">Callback para manipular a resposta.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">{'data.setResponse({ body, headers })'}</span>
                      <span className="ml-2 text-xs opacity-70">Define nova resposta.</span>
                    </div>
                    <div className="bg-base-200 rounded-lg p-3">
                      <span className="font-mono text-xs">data.responseCode(200)</span>
                      <span className="ml-2 text-xs opacity-70">Ajusta o status de resposta final.</span>
                    </div>
                  </div>
                </section>

                <section id="fetch" className="mb-8">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-info badge-sm">Fetch utilitário</span>
                  </h4>
                  <div className="bg-base-200 rounded-lg p-3">
                    <span className="font-mono text-xs">{'await data.fetch(url, { method, headers, body })'}</span>
                    <span className="ml-2 text-xs opacity-70">Faz uma requisição HTTP auxiliar.</span>
                  </div>
                </section>

                <section id="exemplos" className="mb-2">
                  <h4 className="flex items-center gap-2">
                    <span className="badge badge-primary badge-sm">Exemplos</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="badge badge-outline badge-xs">Headers</span>
                        <span className="text-xs opacity-70">Remover auth e barrar provider 'openai'</span>
                        <button
                          className="btn btn-xs btn-ghost ml-auto"
                          onClick={() => {
                            navigator.clipboard.writeText(`const rota = data.getRoute();
data.removeHeader('authorization');
if (rota.params?.provider === 'openai') {
  data.Exception('Teste', 400);
}`)
                          }}
                          title="Copiar exemplo"
                        >Copiar</button>
                      </div>
                      <pre className="whitespace-pre-wrap text-xs bg-base-200 p-3 rounded border border-base-300">{`const rota = data.getRoute();
data.removeHeader('authorization');
if (rota.params?.provider === 'openai') {
  data.Exception('Teste', 400);
}`}</pre>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="badge badge-outline badge-xs">Parâmetros</span>
                        <span className="text-xs opacity-70">Garantir model no body</span>
                        <button
                          className="btn btn-xs btn-ghost ml-auto"
                          onClick={() => {
                            navigator.clipboard.writeText(`try {
  let body = JSON.parse(data.getBody() || '{}');
  if (!body.model) {
    body.model = 'gpt-5';
    data.setBody(body);
  }
} catch {}`)
                          }}
                          title="Copiar exemplo"
                        >Copiar</button>
                      </div>
                      <pre className="whitespace-pre-wrap text-xs bg-base-200 p-3 rounded border border-base-300">{`try {
  let body = JSON.parse(data.getBody() || '{}');
  if (!body.model) {
    body.model = 'gpt-5';
    data.setBody(body);
  }
} catch {}`}</pre>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="badge badge-outline badge-xs">Resposta</span>
                        <span className="text-xs opacity-70">Forçar status e sobrescrever body</span>
                        <button
                          className="btn btn-xs btn-ghost ml-auto"
                          onClick={() => {
                            navigator.clipboard.writeText(`data.onResponse((response) => {
  data.responseCode(200);
  data.setResponse({
    body: Buffer.from(JSON.stringify({ ok: true })),
    headers: { 'Content-Type': 'application/json' }
  });
});`)
                          }}
                          title="Copiar exemplo"
                        >Copiar</button>
                      </div>
                      <pre className="whitespace-pre-wrap text-xs bg-base-200 p-3 rounded border border-base-300">{`data.onResponse((response) => {
  data.responseCode(200);
  data.setResponse({
    body: Buffer.from(JSON.stringify({ ok: true })),
    headers: { 'Content-Type': 'application/json' }
  });
});`}</pre>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div className="modal-action pt-4 border-t border-base-300">
              <button type="button" className="btn btn-primary" onClick={() => setIsDocsOpen(false)}>
                Entendi
              </button>
            </div>
          </div>
        </dialog>
      )}
    </dialog>
  );
}

export default AddForwardModal;