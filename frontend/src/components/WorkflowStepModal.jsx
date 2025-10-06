import React from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup'; // Para HTML/XML
import 'prismjs/themes/prism-tomorrow.css';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import { ChevronLeft, ChevronRight, X, Clock, FileCode, AlertTriangle, CheckCircle } from 'lucide-react';
// Não precisamos mais do ResponseBodyRenderer aqui, pois exibiremos como texto/json formatado

// Estilos do editor
const editorStyles = {
  fontFamily: '"Fira code", "Fira Mono", monospace',
  fontSize: 14,
  outline: 0,
  border: '1px solid hsl(var(--b3))',
  borderRadius: 'var(--rounded-box, 1rem)',
  color: 'hsl(var(--bc))',
  minHeight: '20rem',
  overflow: 'auto',
};

// Função auxiliar para tentar decodificar Base64
function tryDecodeBase64(base64String) {
    if (!base64String) return "[Corpo Original Vazio ou Não Capturado]";
    try {
        // Decodifica Base64 para string binária
        const binaryString = atob(base64String);
        // Converte string binária para Uint8Array
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        // Tenta decodificar como UTF-8
        const decoder = new TextDecoder('utf-8', { fatal: false }); // fatal: false evita erro se não for UTF-8
        return decoder.decode(bytes);
    } catch (e) {
        console.warn("Falha ao decodificar Base64 como UTF-8:", e);
        return "[Dados Binários ou Corrompidos - Base64]";
    }
}

function WorkflowStepModal({ isOpen, onClose, stepData, currentIndex, totalSteps, onNavigate }) {
  if (!isOpen || !stepData) return null;

  const handlePrev = () => {
    if (currentIndex > 0) onNavigate(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < totalSteps - 1) onNavigate(currentIndex + 1);
  };

  // Prepara o conteúdo para exibição no editor
  let displayContent = 'Sem dados detalhados para esta etapa.';
  let language = 'clike'; // Default language

  if (stepData.data) {
      // Caso especial para 'resp-received': mostra corpo original decodificado
      if (stepData.id === 'resp-received' && stepData.data.originalBodyBase64) {
          const decodedBody = tryDecodeBase64(stepData.data.originalBodyBase64);
          const originalContentType = stepData.data.headers?.['content-type'];

          if (originalContentType?.includes('json')) {
              try {
                  displayContent = JSON.stringify(JSON.parse(decodedBody), null, 2);
                  language = 'json';
              } catch (e) {
                  displayContent = `--- Corpo Original (Base64 Decodificado, não JSON válido) ---\n${decodedBody}`;
                  language = 'clike';
              }
          } else if (originalContentType?.includes('html') || originalContentType?.includes('xml')) {
               displayContent = decodedBody;
               language = 'markup';
          }
           else {
                // --- Corpo Original (Base64 Decodificado) ---
               displayContent = `${decodedBody}`;
               language = 'clike';
          }
      }
      // Para outras etapas, apenas formata o objeto 'data' como JSON
      else {
          displayContent = JSON.stringify(stepData.data, null, 2);
          language = 'json';
      }
  } else if (stepData.status === 'pending') {
      displayContent = 'Aguardando execução...';
  } else if (stepData.status === 'skipped') {
      displayContent = 'Etapa não executada.';
  } else if (stepData.status === 'error') {
       displayContent = 'Erro nesta etapa (sem dados detalhados).';
  }


  return (
    <dialog id="workflow_step_modal" className="modal modal-open bg-black bg-opacity-70">
      <div className="modal-box w-11/12 max-w-4xl animate-scale-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-base-300">
          <div className="flex items-center gap-3">
            {stepData.status === 'success' ? (
              <div className="bg-success/10 p-3 rounded-full">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            ) : stepData.status === 'error' ? (
              <div className="bg-error/10 p-3 rounded-full">
                <AlertTriangle className="w-6 h-6 text-error" />
              </div>
            ) : (
              <div className="bg-info/10 p-3 rounded-full">
                <FileCode className="w-6 h-6 text-info" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-2xl">{stepData.name}</h3>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm opacity-70">{stepData.details}</p>
                {stepData.time !== null && stepData.time !== undefined && (
                  <div className="badge badge-ghost badge-sm gap-1">
                    <Clock className="w-3 h-3" />
                    {stepData.time}ms
                  </div>
                )}
              </div>
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

        {/* Editor para exibir os dados */}
        <div className="form-control animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <FileCode className="w-4 h-4 opacity-70" />
            <label className="label-text font-medium">Dados da Etapa</label>
            <div className="badge badge-sm badge-outline ml-auto">{language.toUpperCase()}</div>
          </div>
          <Editor
            value={displayContent}
            onValueChange={() => {}} // Read-only
            highlight={(code) => highlight(code || '', languages[language] || languages.clike, language)}
            readOnly
            padding={'1rem'}
            style={editorStyles}
            textareaClassName="focus:outline-none"
            className="bg-base-200 rounded-box border border-base-300 shadow-inner"
          />
        </div>

        {/* Ações / Navegação */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-base-300">
          <button
            className="btn btn-ghost gap-2 hover-lift"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>

          <div className="text-sm opacity-70">
            Etapa {currentIndex + 1} de {totalSteps}
          </div>

          <button
            className="btn btn-ghost gap-2 hover-lift"
            onClick={handleNext}
            disabled={currentIndex === totalSteps - 1}
          >
            Próxima
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}

export default WorkflowStepModal;