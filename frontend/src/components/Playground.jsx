import React, { useState, useEffect, useContext, useCallback } from 'react';
import { getForwards } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-tomorrow.css'; // Ou outro tema
// Garante que todos os ícones usados em WorkflowTrace estão importados
import { FaPaperPlane, FaArrowLeft, FaArrowRight, FaServer, FaCode, FaShare, FaSearch, FaCheckCircle, FaTimesCircle, FaExchangeAlt, FaFlask, FaExternalLinkAlt } from 'react-icons/fa';
import { Send, ChevronLeft, Settings, FileCode, Workflow, ArrowRight, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import WorkflowStepModal from './WorkflowStepModal'; // Importa o novo modal
import ResponseBodyRenderer from './ResponseBodyRenderer'; // Importa o renderer do corpo da resposta

// Estilos básicos para o editor
const editorStyles = {
  fontFamily: '"Fira code", "Fira Mono", monospace',
  fontSize: 14,
  outline: 0,
  color: 'hsl(var(--bc))',
  minHeight: '10rem',
  overflow: 'auto',
};

// Função auxiliar para derivar path padrão da URL
function getDefaultPathFromUrl(urlString) {
  try {
    const base = urlString.startsWith('/') ? window.location.origin : undefined;
    const parsedUrl = new URL(urlString, base);
    const pathname = parsedUrl.pathname || '/';
    return pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  } catch (e) { return '/'; }
}

// Definição base das etapas do fluxo
const workflowStepsDefinition = [
  { id: 'req-received', name: 'Requisição Recebida', icon: FaArrowRight, details: 'Cliente ⇾ Route Forward' },
  { id: 'config-lookup', name: 'Busca Configuração', icon: FaSearch, details: 'DB (Slug/Path)' },
  { id: 'header-validation', name: 'Validação/Modificação Headers', icon: FaCode, details: 'Script (Opcional)' },
  { id: 'param-validation', name: 'Validação/Modificação Parâmetros', icon: FaCode, details: 'Script (Opcional)' },
  { id: 'req-sent', name: 'Requisição Enviada', icon: FaShare, details: '⇾ REQ API Destino', color: 'text-cyan-300' },
  { id: 'resp-received', name: 'Resposta Recebida', icon: FaArrowLeft, details: '⇽ RESP API Destino', color: 'text-green-300' },
  { id: 'resp-manipulation', name: 'Manipulação Resposta', icon: FaCode, details: '[Intercept] Script (Opcional)', color: 'text-yellow-400' },
  { id: 'resp-sent', name: 'Resposta Enviada', icon: FaShare, details: '⇾ Cliente', iconTransform: 'scaleX(-1)' },
];

// Componente WorkflowTrace agora apenas renderiza a timeline com botões
const WorkflowTrace = ({ processedSteps, onStepClick }) => {
  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Fluxo da Requisição</h2>
        <ul className="timeline timeline-vertical">
          {processedSteps.map((step, index) => (
            <li key={step.id}>
              {index !== 0 && <hr className={`${step.status === 'success' ? 'bg-primary' : step.status === 'error' ? 'bg-error' : 'bg-base-content/10'}`} />}
              <div className={`timeline-start text-xs text-right pr-2 opacity-70 ${step.color ? step.color : ''}`}>{step.details}</div>
              <div className="timeline-middle">
                <span className={`
                                    w-8 h-8 rounded-full flex items-center justify-center text-lg
                                    ${step.status === 'success' ? 'bg-success text-success-content' :
                    step.status === 'error' ? 'bg-error text-error-content' :
                      step.status === 'skipped' ? 'bg-warning text-warning-content' :
                        'bg-base-300 text-base-content/50'}
                                `}>
                  {(() => { const IconComponent = step.icon; return <IconComponent style={step.iconTransform ? { transform: step.iconTransform } : {}} />; })()}
                </span>
              </div>
              <div className="timeline-end pl-2 pb-4">
                <button
                  className="btn btn-xs btn-ghost text-left justify-start w-full hover:bg-base-200"
                  onClick={() => onStepClick(index)}
                  disabled={step.status === 'pending' || step.status === 'skipped'}
                >
                  <span className="text-sm font-medium">{step.name}</span>
                  {step.time !== null && step.time !== undefined && <span className="text-xs opacity-70 ml-1">({step.time}ms)</span>} {/* Mostra tempo se existir */}
                  {(step.data || step.status === 'error') && <FaExternalLinkAlt className="ml-auto text-xs opacity-50" />}
                </button>
              </div>
              {index !== processedSteps.length - 1 && <hr className={`${step.status === 'success' ? 'bg-primary' : step.status === 'error' ? 'bg-error' : 'bg-base-content/10'}`} />}
            </li>
          ))}
        </ul>
        <p className="text-xs italic mt-4 text-center opacity-70">Clique em uma etapa concluída ou com erro para ver os detalhes.</p>
      </div>
    </div>
  );
};


function Playground({ navigateTo }) {
  const { logout } = useContext(AuthContext);
  const [forwards, setForwards] = useState([]);
  const [selectedForwardId, setSelectedForwardId] = useState('');
  const [selectedMethod, setSelectedMethod] = useState(''); // Método selecionado quando há múltiplos
  const [subPath, setSubPath] = useState('');
  // Estado para parâmetros dinâmicos
  // Removido: const [routeParams, setRouteParams] = useState({});
  const [requestHeaders, setRequestHeaders] = useState('Accept: application/json');
  const [bodyType, setBodyType] = useState('json'); // 'json', 'text', 'form-data', 'file'
  const [requestBody, setRequestBody] = useState('{\n  "message": "Olá do Playground!"\n}');
  const [requestFile, setRequestFile] = useState(null);
  const [responseStatus, setResponseStatus] = useState(null);
  const [responseHeaders, setResponseHeaders] = useState('');
  const [responseBlob, setResponseBlob] = useState(null);
  const [responseContentType, setResponseContentType] = useState(null);
  const [rawResponseHeaders, setRawResponseHeaders] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingForwards, setLoadingForwards] = useState(true);
  const [error, setError] = useState('');
  const [trace, setTrace] = useState(null);
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState(null);

  useEffect(() => {
    const fetchForwardsList = async () => {
      setLoadingForwards(true);
      try {
        const data = await getForwards();
        setForwards(data || []);
        if (data && data.length > 0) {
          setSelectedForwardId(data[0].id);
        }
      } catch (err) {
        setError('Erro ao carregar lista de forwards: ' + err.message);
      } finally {
        setLoadingForwards(false);
      }
    };
    fetchForwardsList();
  }, []);

  // Atualiza o método selecionado quando o forward muda
  useEffect(() => {
    const forward = getSelectedForward();
    if (forward) {
      const metodos = Array.isArray(forward.metodo) ? forward.metodo : [forward.metodo];
      setSelectedMethod(metodos[0]); // Define o primeiro método como padrão
    }
  }, [selectedForwardId, forwards]);

  const getSelectedForward = useCallback(() => {
    if (!selectedForwardId) return null;
    return forwards.find(f => f.id === parseInt(selectedForwardId, 10));
  }, [forwards, selectedForwardId]);

  const handleSendRequest = async () => {
    const selectedForward = getSelectedForward();
    if (!selectedForward) {
      setError('Por favor, selecione um forward.');
      return;
    }

    setLoading(true);
    setError('');
    setResponseStatus(null);
    setResponseHeaders('');
    setResponseBlob(null);
    setResponseContentType(null);
    setRawResponseHeaders({});
    setTrace({ 'req-received': { status: 'success', data: { info: 'Iniciando envio...' } } });

    try {
      // Construir a rota corretamente: /{slug}{custom_route}{subPath}
      let routePath = `/${selectedForward.slug}`;

      // Lógica para extrair parâmetros dinâmicos do início do subPath
      let customRoute = selectedForward.custom_route && selectedForward.custom_route.trim() !== '' && selectedForward.custom_route !== '/'
        ? (selectedForward.custom_route.startsWith('/') ? selectedForward.custom_route : '/' + selectedForward.custom_route)
        : '';
      let finalSubPath = subPath;
      if (customRoute) {
        // Extrai parâmetros dinâmicos do customRoute
        const paramMatches = [...customRoute.matchAll(/\{([^}]+)\}/g)];
        let subPathRemainder = subPath;
        let replacedRoute = customRoute;
        if (paramMatches.length > 0 && subPath && subPath.trim() !== '') {
          // Para cada parâmetro, extrai o primeiro segmento do subPath
          let segments = subPath.replace(/^\/+/, '').split('/');
          paramMatches.forEach((m, idx) => {
            const paramValue = segments[idx] || '';
            replacedRoute = replacedRoute.replace(`{${m[1]}}`, paramValue);
          });
          // O restante vira o wildcard
          finalSubPath = segments.slice(paramMatches.length).join('/');
        }
        routePath += replacedRoute;
      }

      // Adiciona subPath restante se existir
      if (finalSubPath && finalSubPath.trim() !== '') {
        const fullSubPath = finalSubPath.startsWith('/') ? finalSubPath : '/' + finalSubPath;
        routePath += fullSubPath;
      }

      const backendBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');
      const requestUrl = `${backendBaseUrl}${routePath}`;

      // Parseia headers do formato "Key: Value" linha por linha
      let headersObj = {};
      if (requestHeaders.trim()) {
        const lines = requestHeaders.split('\n');
        lines.forEach(line => {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            if (key && value) {
              headersObj[key] = value;
            }
          }
        });
      }

      const token = localStorage.getItem('authToken');
      if (token) { headersObj['Authorization'] = `Bearer ${token}`; }
      // Adiciona o header para indicar que a requisição vem do Playground
      headersObj['X-Source'] = 'Playground';

      // Usa o método selecionado pelo usuário
      const method = selectedMethod.toUpperCase();
      let bodyToSend = undefined;

      if (method === 'GET' || method === 'HEAD') {
        // Não enviar body nem Content-Type em GET/HEAD
        bodyToSend = undefined;
        // Remove qualquer Content-Type pré-definido (inclusive vindo do textarea)
        Object.keys(headersObj).forEach(k => {
          if (k.toLowerCase() === 'content-type') delete headersObj[k];
        });
        // Garante aceitação de JSON
        if (!headersObj['Accept'] && !headersObj['accept']) {
          headersObj['Accept'] = 'application/json';
        }
      } else {
        // Processa o corpo baseado no tipo selecionado
        if (bodyType === 'json' && requestBody.trim() !== '') {
          try {
            bodyToSend = JSON.stringify(JSON.parse(requestBody));
            headersObj['Content-Type'] = 'application/json';
          } catch (e) {
            throw new Error('Corpo JSON inválido: ' + e.message);
          }
        } else if (bodyType === 'text' && requestBody.trim() !== '') {
          bodyToSend = requestBody;
          if (!headersObj['Content-Type']) headersObj['Content-Type'] = 'text/plain';
        } else if (bodyType === 'form-data' && requestBody.trim() !== '') {
          const formData = new URLSearchParams();
          const lines = requestBody.split('\n');
          lines.forEach(line => {
            const equalIndex = line.indexOf('=');
            if (equalIndex > 0) {
              const key = line.substring(0, equalIndex).trim();
              const value = line.substring(equalIndex + 1).trim();
              if (key) formData.append(key, value);
            }
          });
          bodyToSend = formData.toString();
          headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
        } else if (bodyType === 'file' && requestFile) {
          const formData = new FormData();
          formData.append('file', requestFile);
          bodyToSend = formData;
          // Não define Content-Type para FormData - o browser define automaticamente com boundary
          Object.keys(headersObj).forEach(k => {
            if (k.toLowerCase() === 'content-type') delete headersObj[k];
          });
        }
      }

      const response = await fetch(requestUrl, { method, headers: headersObj, body: bodyToSend });

      setResponseStatus(`${response.status} ${response.statusText}`);

      const rawHeaders = {};
      response.headers.forEach((value, key) => { rawHeaders[key] = value; });
      setRawResponseHeaders(rawHeaders);
      const contentType = rawHeaders['content-type'];
      setResponseContentType(contentType);

      const headersForDisplay = { ...rawHeaders };
      delete headersForDisplay['x-forward-trace'];
      setResponseHeaders(JSON.stringify(headersForDisplay, null, 2));

      const traceHeaderBase64 = rawHeaders['x-forward-trace']; // Nome da variável mudou para clareza
      if (traceHeaderBase64) {
        try {
          // Decodifica de Base64 e faz o parse do JSON
          const decodedTraceJson = atob(traceHeaderBase64);
          const parsedTrace = JSON.parse(decodedTraceJson);
          console.log("Trace recebido (Base64):", traceHeaderBase64);
          console.log("Trace decodificado e parseado:", parsedTrace);

          // Usar o trace completo recebido do backend
          setTrace(parsedTrace);
        } catch (e) {
          console.error("Erro ao decodificar/parsear header X-Forward-Trace:", e);
          // Mantém o fallback, mas adiciona info sobre o erro de decodificação
          setTrace({
            error: {
              status: 'error',
              data: { message: "Falha ao decodificar/parsear dados de rastreamento.", rawValue: traceHeaderBase64 }
            },
            'req-received': {
              status: 'success',
              data: { info: "Requisição recebida pelo servidor" }
            }
          });
        }
      } else {
        // Se não houver trace (requisição não veio do Playground ou erro no backend ao setar),
        // criar um trace simulado com base nos dados da resposta
        console.log("Header X-Forward-Trace não encontrado. Gerando trace simulado.");
        const completeTrace = {};

        // Preencher cada etapa do fluxo com dados relevantes e específicos
        workflowStepsDefinition.forEach(step => {
          if (step.id === 'req-received') {
            completeTrace[step.id] = {
              status: 'success',
              data: {
                method: method,
                url: requestUrl,
                headers: headersObj,
                body: bodyToSend,
                timestamp: new Date().toISOString()
              }
            };
          } else if (step.id === 'config-lookup') {
            completeTrace[step.id] = {
              status: 'success',
              data: {
                forward: selectedForward ? {
                  id: selectedForward.id,
                  nome: selectedForward.nome,
                  slug: selectedForward.slug,
                  metodo: selectedForward.metodo,
                  url_destino: selectedForward.url_destino,
                  custom_route: selectedForward.custom_route
                } : 'Não disponível',
                subPath: subPath || '(nenhum)',
                fullPath: `/${selectedForward?.slug}${subPath || ''}`
              }
            };
          } else if (step.id === 'header-validation') {
            completeTrace[step.id] = {
              status: 'success',
              data: {
                headersOriginal: headersObj,
                hasScript: selectedForward?.headers_validator_script ? true : false,
                info: selectedForward?.headers_validator_script
                  ? "Headers processados pelo script configurado"
                  : "Sem script de validação configurado"
              }
            };
          } else if (step.id === 'param-validation') {
            const forwardMetodo = Array.isArray(selectedForward?.metodo) ? selectedForward.metodo[0] : selectedForward?.metodo;
            completeTrace[step.id] = {
              status: 'success',
              data: {
                paramsType: forwardMetodo === 'GET' ? 'query' : 'body',
                paramsOriginal: forwardMetodo === 'GET' ? {} : bodyToSend,
                hasScript: selectedForward?.params_validator_script ? true : false,
                info: selectedForward?.params_validator_script
                  ? "Parâmetros processados pelo script configurado"
                  : "Sem script de validação configurado"
              }
            };
          } else if (step.id === 'req-sent') {
            completeTrace[step.id] = {
              status: 'success',
              data: {
                url: selectedForward?.url_destino,
                method: selectedForward?.metodo,
                headers: headersObj,
                body: bodyToSend,
                timestamp: new Date().toISOString()
              }
            };
          } else if (step.id === 'resp-received') {
            completeTrace[step.id] = {
              status: 'success',
              data: {
                status: response.status,
                statusText: response.statusText,
                headers: rawHeaders,
                contentType: contentType,
                contentLength: rawHeaders['content-length'] || 'N/A',
                timestamp: new Date().toISOString()
              }
            };
          } else if (step.id === 'resp-manipulation') {
            completeTrace[step.id] = {
              status: 'success',
              data: {
                hasScript: selectedForward?.response_script ? true : false,
                info: selectedForward?.response_script
                  ? "Resposta processada pelo script configurado"
                  : "Sem script de manipulação configurado",
                contentType: contentType,
                responseStatus: response.status
              }
            };
          } else if (step.id === 'resp-sent') {
            completeTrace[step.id] = {
              status: 'success',
              data: {
                status: response.status,
                statusText: response.statusText,
                contentType: contentType,
                contentLength: rawHeaders['content-length'] || 'N/A',
                timestamp: new Date().toISOString()
              }
            };
          } else {
            // Para outras etapas, usar dados genéricos
            completeTrace[step.id] = {
              status: 'success',
              data: {
                info: `Etapa ${step.name} concluída`,
                timestamp: new Date().toISOString()
              }
            };
          }
        });
        // Adicionar tempos estimados para cada etapa
        let cumulativeTime = 0;
        const timeEstimates = {
          'req-received': 5,
          'config-lookup': 10,
          'header-validation': 15,
          'param-validation': 10,
          'req-sent': 50,
          'resp-received': 100,
          'resp-manipulation': 15,
          'resp-sent': 5
        };

        // Distribuir o tempo total entre as etapas
        Object.keys(completeTrace).forEach(key => {
          if (timeEstimates[key]) {
            completeTrace[key].time = timeEstimates[key];
            cumulativeTime += timeEstimates[key];
          }
        });

        setTrace(completeTrace);
        setTrace(completeTrace);
      }

      const blob = await response.blob();
      setResponseBlob(blob);

    } catch (err) {
      console.error("Erro ao enviar requisição do Playground:", err);
      setError(err.message || 'Erro desconhecido ao enviar requisição.');

      // Criar um trace de erro detalhado
      const detailedErrorTrace = {};

      // Preencher cada etapa do fluxo com dados relevantes
      workflowStepsDefinition.forEach((step, index) => {
        if (step.id === 'req-received') {
          detailedErrorTrace[step.id] = {
            status: 'success',
            data: {
              method: method,
              url: requestUrl,
              headers: headersObj,
              body: bodyToSend,
              timestamp: new Date().toISOString()
            }
          };
        } else if (index <= 1) { // Assumir que as primeiras etapas foram concluídas
          detailedErrorTrace[step.id] = {
            status: 'success',
            data: {
              info: `Etapa ${step.name} concluída`,
              timestamp: new Date().toISOString()
            }
          };
        } else {
          // Para outras etapas, marcar como puladas devido ao erro
          detailedErrorTrace[step.id] = {
            status: 'skipped',
            data: {
              info: `Etapa pulada devido a erro: ${err.message}`,
              timestamp: new Date().toISOString()
            }
          };
        }
      });

      // Adicionar informações de erro
      detailedErrorTrace['error'] = {
        status: 'error',
        data: {
          message: err.message,
          stack: err.stack,
          timestamp: new Date().toISOString()
        }
      };

      // Tentar extrair informações adicionais do erro, se disponíveis
      // Tenta obter o trace mesmo em caso de erro (pode ter sido setado antes do erro final)
      const traceHeaderOnErrorBase64 = err.response?.headers?.get('x-forward-trace');
      if (traceHeaderOnErrorBase64) {
        try {
          // Decodifica de Base64 e faz o parse do JSON
          const decodedErrorTraceJson = atob(traceHeaderOnErrorBase64);
          const parsedErrorTrace = JSON.parse(decodedErrorTraceJson);
          console.log("Trace de erro recebido (Base64):", traceHeaderOnErrorBase64);
          console.log("Trace de erro decodificado e parseado:", parsedErrorTrace);
          // Usar o trace recebido do backend, que é mais preciso
          setTrace(parsedErrorTrace);
        } catch (e) {
          console.error("Erro ao decodificar/parsear trace de erro:", e);
          // Adiciona a informação do erro de parse ao trace detalhado
          detailedErrorTrace.error.data.traceParseError = e.message;
          detailedErrorTrace.error.data.rawTraceOnError = traceHeaderOnErrorBase64;
          setTrace(detailedErrorTrace);
        }
      } else {
        console.log("Header X-Forward-Trace não encontrado no erro. Usando trace simulado.");
        // Adicionar tempos estimados para cada etapa no caso de erro e sem trace
        const timeEstimates = {
          'req-received': 5,
          'config-lookup': 10,
          'header-validation': 15,
          'param-validation': 10,
          'req-sent': 50,
          'resp-received': 0,
          'resp-manipulation': 0,
          'resp-sent': 0
        };

        // Distribuir o tempo entre as etapas
        Object.keys(detailedErrorTrace).forEach(key => {
          if (timeEstimates[key] && detailedErrorTrace[key].status === 'success') {
            detailedErrorTrace[key].time = timeEstimates[key];
          }
        });

        setTrace(detailedErrorTrace);
      }
    } finally {
      setLoading(false);
    }
  };

  const processTraceData = useCallback(() => {
    console.log("Processando trace:", trace);
    let previousStepFailed = false;

    return workflowStepsDefinition.map(step => {
      const currentStepData = { ...step };

      // Verifica se o trace existe e é um objeto válido
      if (!trace || typeof trace !== 'object') {
        currentStepData.status = 'pending';
        currentStepData.data = null;
        currentStepData.time = null;
        return currentStepData;
      }

      // Obtém informações específicas para esta etapa do trace
      const traceInfoForStep = trace[step.id];
      console.log(`Etapa ${step.id}:`, traceInfoForStep);

      if (previousStepFailed) {
        // Se uma etapa anterior falhou, marca esta como pulada
        currentStepData.status = 'skipped';
        currentStepData.data = { info: "Etapa pulada devido a erro anterior." };
      } else if (traceInfoForStep) {
        // Se há informações para esta etapa no trace, usa-as
        currentStepData.status = traceInfoForStep.status || 'success';
        currentStepData.data = traceInfoForStep.data || null;
        currentStepData.time = traceInfoForStep.time || null;

        // Se esta etapa falhou, marca para pular as próximas
        if (currentStepData.status === 'error') {
          previousStepFailed = true;
        }
      } else if (trace.error) {
        // Se há um erro geral, marca como pulada
        currentStepData.status = 'skipped';
        currentStepData.data = { info: "Etapa pulada devido a erro geral." };
      } else {
        // Caso padrão: etapa pendente
        currentStepData.status = 'pending';
        currentStepData.data = null;
        currentStepData.time = null;
      }

      // Tratamento especial para a última etapa em caso de erro geral
      if (trace.error && step.id === workflowStepsDefinition[workflowStepsDefinition.length - 1].id) {
        currentStepData.status = 'error';
        currentStepData.data = trace.error.data || { message: "Falha geral na requisição." };
        previousStepFailed = true;
      }

      return currentStepData;
    });
  }, [trace]);

  const processedSteps = processTraceData();

  const handleOpenWorkflowModal = (index) => {
    setSelectedStepIndex(index);
    setIsWorkflowModalOpen(true);
  };

  const handleCloseWorkflowModal = () => {
    setIsWorkflowModalOpen(false);
    setSelectedStepIndex(null);
  };

  const handleNavigateWorkflowModal = (newIndex) => {
    if (newIndex >= 0 && newIndex < processedSteps.length) {
      setSelectedStepIndex(newIndex);
    }
  };

  const selectedForward = getSelectedForward();

  // Helper para obter placeholder baseado no tipo de corpo
  const getBodyPlaceholder = () => {
    switch (bodyType) {
      case 'json':
        return '{\n  "key": "value"\n}';
      case 'text':
        return 'Texto livre...';
      case 'form-data':
        return 'key1=value1\nkey2=value2';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200 p-4 flex flex-col">
      {/* Navbar */}
      <div className="navbar glass-effect shadow-xl mb-8 border border-base-300 animate-slide-down">
        <div className="flex-none">
          <button className="btn btn-ghost gap-2 hover-lift" onClick={() => navigateTo('dashboard')}>
            <ChevronLeft className="w-5 h-5" />
            Dashboard
          </button>
        </div>
        <div className="flex-1 justify-center">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg animate-pulse-soft">
              <FaFlask className="w-6 h-6 text-primary" />
            </div>
            <span className="text-2xl font-bold">Playground</span>
          </div>
        </div>
        <div className="flex-none">
          {/* Botão de logout removido conforme solicitado */}
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="container mx-auto flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">

        {/* Coluna da Requisição */}
        <div className="card bg-base-100 shadow-xl border border-base-300 hover-lift">
          <div className="card-body gap-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <h2 className="card-title text-2xl">Configurar Requisição</h2>
            </div>

            {/* Selecionar Forward */}
            <div className="form-control w-full">
              <label className="label pb-1">
                <span className="label-text font-medium flex items-center gap-2">
                  <Settings className="w-4 h-4 opacity-70" />
                  Forward Configurado
                </span>
              </label>
              {loadingForwards ? (
                <div className="flex items-center gap-2">
                  <span className="loading loading-sm loading-spinner"></span>
                  <span className="text-sm opacity-70">Carregando forwards...</span>
                </div>
              ) : forwards.length > 0 ? (
                <select className="select select-bordered select-primary w-full" value={selectedForwardId} onChange={(e) => setSelectedForwardId(e.target.value)} disabled={loading}>
                  {forwards.map(fwd => {
                    const metodos = Array.isArray(fwd.metodo) ? fwd.metodo.join(', ') : fwd.metodo;
                    // Monta a rota: /{slug}{custom_route}/*
                    let routeDisplay = `/${fwd.slug}`;
                    if (fwd.custom_route && fwd.custom_route.trim() !== '' && fwd.custom_route !== '/') {
                      const customRoute = fwd.custom_route.startsWith('/') ? fwd.custom_route : '/' + fwd.custom_route;
                      routeDisplay += customRoute;
                    }
                    routeDisplay += '/*';
                    return (
                      <option key={fwd.id} value={fwd.id}>
                        {fwd.nome} ({metodos} {routeDisplay})
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="alert alert-warning shadow-lg">
                  <AlertCircle className="w-5 h-5" />
                  <span>Nenhum forward cadastrado.</span>
                </div>
              )}
            </div>

            {/* Seleção de Método HTTP (quando há múltiplos) */}
            {selectedForward && Array.isArray(selectedForward.metodo) && selectedForward.metodo.length > 1 && (
              <div className="form-control w-full">
                <label className="label pb-1">
                  <span className="label-text font-medium flex items-center gap-2">
                    <FaExchangeAlt className="w-4 h-4 opacity-70" />
                    Método HTTP
                  </span>
                </label>
                <select
                  className="select select-bordered select-secondary w-full"
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                  disabled={loading}
                >
                  {selectedForward.metodo.map(metodo => (
                    <option key={metodo} value={metodo}>
                      {metodo}
                    </option>
                  ))}
                </select>
                <div className="label pt-1">
                  <span className="label-text-alt text-xs opacity-70">
                    Este forward aceita múltiplos métodos. Selecione o método para teste.
                  </span>
                </div>
              </div>
            )}

            {/* Sub-Path */}
            <div className="form-control w-full mb-4">
              <label className="label pb-1"><span className="label-text font-medium">Sub-caminho Adicional</span></label>
              <input
                type="text"
                placeholder="openai/v1/models"
                className="input input-bordered w-full"
                value={subPath}
                onChange={(e) => setSubPath(e.target.value)}
                disabled={loading || !selectedForward}
              />
              <div className="label pt-1">
                <span className="label-text-alt text-xs opacity-70">
                  {selectedForward ? (() => {
                    let basePath = `/${selectedForward.slug}`;
                    if (selectedForward.custom_route && selectedForward.custom_route.trim() !== '' && selectedForward.custom_route !== '/') {
                      let customRoute = selectedForward.custom_route.startsWith('/') ? selectedForward.custom_route : '/' + selectedForward.custom_route;
                      // Preview: se houver parâmetro dinâmico, mostra {param}
                      basePath += customRoute;
                    }
                    return `Será anexado a: ${basePath}`;
                  })() : 'Selecione um forward'}
                </span>
              </div>
              {selectedForward && selectedForward.custom_route && selectedForward.custom_route.includes('{') && (
                <div className="label pt-0">
                  <span className="label-text-alt text-xs opacity-60">
                    O primeiro segmento do sub-caminho será usado para preencher o parâmetro dinâmico da rota.
                  </span>
                </div>
              )}
            </div>

            {/* Headers Req */}
            <div className="collapse collapse-arrow border border-base-300 bg-base-200 rounded-box mb-4">
              <input type="checkbox" className="peer" />
              <div className="collapse-title text-sm font-medium peer-checked:bg-base-300">
                Headers (Key: Value)
              </div>
              <div className="collapse-content bg-base-100 p-4">
                <textarea
                  className="textarea textarea-bordered w-full min-h-[8rem] font-mono text-sm"
                  placeholder="Content-Type: application/json&#10;Authorization: Bearer token"
                  value={requestHeaders}
                  onChange={(e) => setRequestHeaders(e.target.value)}
                  disabled={loading || !selectedForward}
                />
                <div className="label">
                  <span className="label-text-alt text-xs opacity-70">
                    Um header por linha no formato: Nome: Valor
                  </span>
                </div>
              </div>
            </div>

            {/* Body Req */}
            <div className="collapse collapse-arrow border border-base-300 bg-base-200 rounded-box mb-4">
              <input type="checkbox" className="peer" defaultChecked />
              <div className="collapse-title text-sm font-medium peer-checked:bg-base-300">
                Corpo da Requisição
              </div>
              <div className="collapse-content bg-base-100 !p-4">
                {/* Seletor de Tipo */}
                <div className="form-control mb-4">
                  <label className="label pb-1">
                    <span className="label-text font-medium text-xs">Tipo de Conteúdo</span>
                  </label>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={bodyType}
                    onChange={(e) => setBodyType(e.target.value)}
                    disabled={loading || !selectedForward}
                  >
                    <option value="json">JSON</option>
                    <option value="text">Texto</option>
                    <option value="form-data">Form Data (URL Encoded)</option>
                    <option value="file">Upload de Arquivo</option>
                  </select>
                </div>

                {/* Editor baseado no tipo */}
                {bodyType === 'file' ? (
                  <div className="form-control">
                    <input
                      type="file"
                      className="file-input file-input-bordered w-full"
                      onChange={(e) => setRequestFile(e.target.files?.[0] || null)}
                      disabled={loading || !selectedForward}
                    />
                    {requestFile && (
                      <div className="label">
                        <span className="label-text-alt text-xs">
                          Arquivo: {requestFile.name} ({(requestFile.size / 1024).toFixed(2)} KB)
                        </span>
                      </div>
                    )}
                  </div>
                ) : bodyType === 'json' ? (
                  <Editor
                    value={requestBody}
                    onValueChange={setRequestBody}
                    highlight={(code) => highlight(code || '', languages.json, 'json')}
                    padding={'1rem'}
                    style={{ ...editorStyles, minHeight: '10rem' }}
                    textareaClassName="focus:outline-none"
                    disabled={loading || !selectedForward}
                    className="bg-base-300 rounded-lg border border-base-300"
                    placeholder={getBodyPlaceholder()}
                  />
                ) : (
                  <>
                    <textarea
                      className="textarea textarea-bordered w-full min-h-[10rem] font-mono text-sm"
                      placeholder={getBodyPlaceholder()}
                      value={requestBody}
                      onChange={(e) => setRequestBody(e.target.value)}
                      disabled={loading || !selectedForward}
                    />
                    {bodyType === 'form-data' && (
                      <div className="label">
                        <span className="label-text-alt text-xs opacity-70">
                          Um parâmetro por linha no formato: chave=valor
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Botão Enviar */}
            <button
              className="btn btn-primary mt-4 w-full gap-2 shadow-lg hover-lift text-lg"
              onClick={handleSendRequest}
              disabled={loading || !selectedForward}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Enviar Requisição
                </>
              )}
            </button>
            {error && (
              <div className="alert alert-error shadow-lg animate-shake">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Coluna da Resposta e Trace */}
        <div className="flex flex-col gap-6">
          {/* Resposta */}
          <div className="card bg-base-100 shadow-xl border border-base-300 hover-lift">
            <div className="card-body gap-4">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${responseStatus ? (responseStatus.startsWith('2') ? 'bg-success/10' : 'bg-error/10') : 'bg-base-200'}`}>
                  {responseStatus ? (
                    responseStatus.startsWith('2') ? <CheckCircle className="w-5 h-5 text-success" /> : <AlertCircle className="w-5 h-5 text-error" />
                  ) : (
                    <FileCode className="w-5 h-5 opacity-50" />
                  )}
                </div>
                <h2 className="card-title text-2xl">Resposta Recebida</h2>
              </div>

              <div className="form-control">
                <label className="label"><span className="label-text font-medium">Status HTTP</span></label>
                {responseStatus ? (
                  <div className={`badge ${responseStatus.startsWith('2') ? 'badge-success' :
                    responseStatus.startsWith('3') ? 'badge-warning' :
                      responseStatus.startsWith('4') ? 'badge-error' :
                        responseStatus.startsWith('5') ? 'badge-error' :
                          'badge-ghost'
                    } badge-lg gap-2 shadow-md`}>
                    {responseStatus.startsWith('2') ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {responseStatus}
                  </div>
                ) : (
                  <span className="badge badge-ghost badge-lg">Aguardando resposta...</span>
                )}
              </div>
              {/* Headers Resp */}
              <div className="collapse collapse-arrow border border-base-300 bg-base-200 rounded-box mb-4">
                <input type="checkbox" className="peer" defaultChecked />
                <div className="collapse-title text-sm font-medium peer-checked:bg-base-300">
                  Headers da Resposta (JSON)
                </div>
                <div className="collapse-content bg-base-100 !p-0">
                  <Editor
                    value={responseHeaders}
                    onValueChange={() => { }}
                    highlight={(code) => highlight(code || '', languages.json, 'json')}
                    padding={'1rem'}
                    style={{ ...editorStyles, minHeight: '6rem', border: 'none', borderRadius: '0 0 var(--rounded-box, 1rem) var(--rounded-box, 1rem)' }}
                    textareaClassName="focus:outline-none"
                    className="bg-base-300"
                    readOnly />
                </div>
              </div>
              {/* Corpo Resp */}
              <div className="collapse collapse-arrow border border-base-300 bg-base-200 rounded-box">
                <input type="checkbox" className="peer" defaultChecked />
                <div className="collapse-title text-sm font-medium peer-checked:bg-base-300">
                  Corpo da Resposta
                </div>
                <div className="collapse-content bg-base-100 p-0">
                  <ResponseBodyRenderer
                    blob={responseBlob}
                    contentType={responseContentType}
                    headers={rawResponseHeaders}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Trace */}
          <WorkflowTrace
            processedSteps={processedSteps}
            onStepClick={handleOpenWorkflowModal}
          />
        </div>

      </main>

      {/* Footer */}
      <footer className="footer footer-center p-4 bg-base-300/50 backdrop-blur-sm text-base-content mt-10 rounded-box border-t border-base-300">
        <aside className="animate-fade-in">
          <p className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="font-semibold">Route Forward</span>
            <span className="opacity-70">- Playground de Testes</span>
          </p>
        </aside>
      </footer>

      {/* Modal para Detalhes do Workflow */}
      <WorkflowStepModal
        isOpen={isWorkflowModalOpen}
        onClose={handleCloseWorkflowModal}
        stepData={selectedStepIndex !== null ? processedSteps[selectedStepIndex] : null}
        currentIndex={selectedStepIndex}
        totalSteps={processedSteps.length}
        onNavigate={handleNavigateWorkflowModal}
      />
    </div>
  );
}

export default Playground;