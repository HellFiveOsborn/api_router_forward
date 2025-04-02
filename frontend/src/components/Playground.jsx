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
                                    {(() => { const IconComponent = step.icon; return <IconComponent style={step.iconTransform ? { transform: step.iconTransform } : {}}/>; })()}
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
                                    {(step.data || step.status === 'error') && <FaExternalLinkAlt className="ml-auto text-xs opacity-50"/>}
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
  const [subPath, setSubPath] = useState('');
  const [requestHeaders, setRequestHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [requestBody, setRequestBody] = useState('{\n  "message": "Olá do Playground!"\n}');
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
      const baseRoute = selectedForward.custom_route ? selectedForward.custom_route.replace(/\/$/, '') : getDefaultPathFromUrl(selectedForward.url_destino);
      const fullSubPath = subPath.startsWith('/') ? subPath : (subPath ? '/' + subPath : '');
      const finalPath = `${baseRoute}${fullSubPath}`.replace(/\/$/, '');
      const backendBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace('/api', '');
      const requestUrl = `${backendBaseUrl}/${selectedForward.slug}${finalPath || '/'}`;

      let headersObj = {};
      try {
        headersObj = JSON.parse(requestHeaders || '{}');
      } catch (e) { throw new Error('Headers da requisição não são um JSON válido.'); }

      const token = localStorage.getItem('authToken');
      if (token) { headersObj['Authorization'] = `Bearer ${token}`; }

      const method = selectedForward.metodo.toUpperCase();
      let bodyToSend = undefined;
      if (method !== 'GET' && method !== 'HEAD' && requestBody.trim() !== '') {
         try {
             bodyToSend = JSON.stringify(JSON.parse(requestBody));
             if (!headersObj['Content-Type']) headersObj['Content-Type'] = 'application/json';
         } catch (e) {
             bodyToSend = requestBody;
              if (!headersObj['Content-Type']) headersObj['Content-Type'] = 'text/plain';
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

      const traceHeader = rawHeaders['x-forward-trace'];
      if (traceHeader) {
          try {
              const parsedTrace = JSON.parse(traceHeader);
              setTrace(parsedTrace);
              console.log("Trace recebido:", parsedTrace);
          } catch (e) {
              console.error("Erro ao parsear header X-Forward-Trace:", e);
              setTrace({ error: { status: 'error', data: { message: "Falha ao parsear dados de rastreamento." } } });
          }
      } else {
           setTrace({ info: { status: 'success', data: { message: "Resposta recebida, mas sem dados de rastreamento detalhados." } } });
      }

      const blob = await response.blob();
      setResponseBlob(blob);

    } catch (err) {
      console.error("Erro ao enviar requisição do Playground:", err);
      setError(err.message || 'Erro desconhecido ao enviar requisição.');
      const traceHeaderOnError = err.response?.headers?.get('x-forward-trace');
       if (traceHeaderOnError) {
          try {
              setTrace(JSON.parse(traceHeaderOnError));
          } catch (e) {
               setTrace({ error: { status: 'error', data: { message: "Falha na requisição. Não foi possível ler o rastreamento." } } });
          }
      } else {
        setTrace({ error: { status: 'error', data: { message: "Falha na requisição.", details: err.message } } });
      }
    } finally {
      setLoading(false);
    }
  };

  const processTraceData = useCallback(() => {
    let previousStepFailed = false;
    return workflowStepsDefinition.map(step => {
        const currentStepData = { ...step };
        const traceInfoForStep = trace && typeof trace === 'object' && !trace.error ? trace[step.id] : null;

        if (previousStepFailed) {
            currentStepData.status = 'skipped';
            currentStepData.data = { info: "Etapa pulada devido a erro anterior." };
        } else if (traceInfoForStep) {
            currentStepData.status = traceInfoForStep.status || 'success';
            currentStepData.data = traceInfoForStep.data || null;
            currentStepData.time = traceInfoForStep.time || null;
            if (currentStepData.status === 'error') {
                previousStepFailed = true;
            }
        } else {
             if (trace?.error) {
                 currentStepData.status = 'skipped';
                 currentStepData.data = { info: "Etapa pulada devido a erro geral." };
             } else {
                if (typeof trace === 'string' && step.id === 'req-received' && trace === 'Enviando requisição...') {
                    currentStepData.status = 'success';
                    currentStepData.data = { info: trace };
                } else {
                    currentStepData.status = 'pending';
                    currentStepData.data = null;
                    currentStepData.time = null;
                }
             }
        }

         if (trace?.error && step.id === workflowStepsDefinition[workflowStepsDefinition.length - 1].id) {
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

  return (
    <div className="min-h-screen bg-base-200 p-4 flex flex-col">
      {/* Navbar */}
      <div className="navbar bg-base-100 rounded-box shadow-lg mb-6">
        <div className="flex-none">
           <button className="btn btn-ghost" onClick={() => navigateTo('dashboard')}>
              <FaArrowLeft className="mr-2"/> Voltar ao Dashboard
           </button>
        </div>
        <div className="flex-1 justify-center">
          <a className="btn btn-ghost text-xl">Playground de Encaminhamento</a>
        </div>
        <div className="flex-none">
          <button className="btn btn-outline btn-error" onClick={logout}>Logout</button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="container mx-auto flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Coluna da Requisição */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body gap-4">
            <h2 className="card-title">Configurar Requisição</h2>
             {/* Selecionar Forward */}
            <div className="form-control">
              <label className="label"><span className="label-text">Forward Configurado</span></label>
              {loadingForwards ? <span className="loading loading-sm"></span> : forwards.length > 0 ? (
                  <select className="select select-bordered" value={selectedForwardId} onChange={(e) => setSelectedForwardId(e.target.value)} disabled={loading}>
                      {forwards.map(fwd => (
                          <option key={fwd.id} value={fwd.id}>
                              {fwd.nome} ({fwd.metodo} /{fwd.slug}{fwd.custom_route ? fwd.custom_route.replace(/\/$/, '') : getDefaultPathFromUrl(fwd.url_destino)})
                          </option>
                      ))}
                  </select>
              ) : <div className="text-warning text-sm">Nenhum forward cadastrado.</div>}
            </div>

            {/* Sub-Path */}
            <div className="form-control">
              <label className="label"><span className="label-text">Sub-caminho Adicional (Opcional)</span></label>
              <input type="text" placeholder="/detalhes/123" className="input input-bordered" value={subPath} onChange={(e) => setSubPath(e.target.value)} disabled={loading || !selectedForward} />
              <div className="label"><span className="label-text-alt text-xs opacity-70">
                  {selectedForward ? `Será anexado a: /${selectedForward.slug}${selectedForward.custom_route ? selectedForward.custom_route.replace(/\/$/, '') : getDefaultPathFromUrl(selectedForward.url_destino)}` : 'Selecione um forward'}
              </span></div>
            </div>

            {/* Headers Req */}
            <div className="collapse collapse-arrow border border-base-300 bg-base-200 rounded-box">
                <input type="checkbox" className="peer" />
                <div className="collapse-title text-sm font-medium peer-checked:bg-base-300">
                    Headers (JSON)
                </div>
                <div className="collapse-content bg-base-100 !p-0">
                     <Editor value={requestHeaders} onValueChange={setRequestHeaders} highlight={(code) => highlight(code || '', languages.json, 'json')}
                        padding={'1rem'} style={{...editorStyles, minHeight: '6rem', border: 'none', borderRadius: '0 0 var(--rounded-box, 1rem) var(--rounded-box, 1rem)'}} textareaClassName="focus:outline-none"
                        disabled={loading || !selectedForward} className="bg-base-300" />
                 </div>
            </div>

            {/* Body Req */}
             <div className="collapse collapse-arrow border border-base-300 bg-base-200 rounded-box">
                <input type="checkbox" className="peer" defaultChecked={selectedForward?.metodo !== 'GET' && selectedForward?.metodo !== 'HEAD'}/>
                <div className="collapse-title text-sm font-medium peer-checked:bg-base-300">
                    Corpo (JSON ou Texto)
                </div>
                <div className="collapse-content bg-base-100 !p-0">
                    <Editor value={requestBody} onValueChange={setRequestBody}
                        highlight={(code) => { try { JSON.parse(code); return highlight(code || '', languages.json, 'json'); } catch(e) { return highlight(code || '', languages.clike, 'clike'); }}}
                        padding={'1rem'} style={{...editorStyles, border: 'none', borderRadius: '0 0 var(--rounded-box, 1rem) var(--rounded-box, 1rem)'}} textareaClassName="focus:outline-none"
                        disabled={loading || !selectedForward || selectedForward?.metodo === 'GET' || selectedForward?.metodo === 'HEAD'} className="bg-base-300" />
                </div>
            </div>

            {/* Botão Enviar */}
            <button className="btn btn-primary mt-4 w-full" onClick={handleSendRequest} disabled={loading || !selectedForward}>
              {loading ? <span className="loading loading-spinner loading-sm"></span> : <><FaPaperPlane className="mr-2"/> Enviar Requisição</>}
            </button>
             {error && <div className="text-error mt-2 text-sm text-center">{error}</div>}
          </div>
        </div>

        {/* Coluna da Resposta e Trace */}
        <div className="flex flex-col gap-6">
          {/* Resposta */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body gap-4">
                <h2 className="card-title">Resposta Recebida</h2>
                <div className="form-control">
                    <label className="label"><span className="label-text">Status</span></label>
                    {responseStatus ? (
                        <span className={`badge ${
                            responseStatus.startsWith('2') ? 'badge-success' :
                            responseStatus.startsWith('3') ? 'badge-warning' :
                            responseStatus.startsWith('4') ? 'badge-error' :
                            responseStatus.startsWith('5') ? 'badge-error' :
                            'badge-ghost'
                        } badge-lg`}>{responseStatus}</span>
                    ) : (
                        <span className="badge badge-ghost badge-lg"> - </span>
                    )}
                </div>
                 {/* Headers Resp */}
                 <div className="collapse collapse-arrow border border-base-300 bg-base-200 rounded-box">
                    <input type="checkbox" className="peer" defaultChecked />
                    <div className="collapse-title text-sm font-medium peer-checked:bg-base-300">
                        Headers da Resposta (JSON)
                    </div>
                    <div className="collapse-content bg-base-100 !p-0">
                        <Editor
                          value={responseHeaders}
                          onValueChange={() => {}}
                          highlight={(code) => highlight(code || '', languages.json, 'json')}
                          padding={'1rem'}
                          style={{...editorStyles, minHeight: '6rem', border: 'none', borderRadius: '0 0 var(--rounded-box, 1rem) var(--rounded-box, 1rem)'}}
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
       <footer className="footer footer-center p-4 bg-base-300 text-base-content mt-10 rounded-box">
            <aside><p>Route Forward - Playground</p></aside>
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