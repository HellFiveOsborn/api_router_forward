import React from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup'; // Para HTML/XML
import 'prismjs/themes/prism-tomorrow.css';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
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
    <dialog id="workflow_step_modal" className="modal modal-open bg-black bg-opacity-60">
      <div className="modal-box w-11/12 max-w-4xl">
        <button type="button" className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={onClose}>✕</button>
        <h3 className="font-bold text-lg mb-1">Detalhes da Etapa: {stepData.name}</h3>
        {/* Mostra tempo se disponível */}
        <p className="text-xs opacity-70 mb-4">{stepData.details} {stepData.time !== null && stepData.time !== undefined ? `(${stepData.time}ms)` : ''}</p>

        {/* Editor para exibir os dados */}
        <div className="form-control">
           <Editor
              value={displayContent}
              onValueChange={() => {}} // Read-only
              highlight={(code) => highlight(code || '', languages[language] || languages.clike, language)}
              readOnly
              padding={'1rem'}
              style={editorStyles}
              textareaClassName="focus:outline-none"
              className="bg-base-300 rounded-box" // Usa cor de fundo diferente
            />
        </div>

        {/* Ações / Navegação */}
        <div className="modal-action mt-4 justify-between">
           <button className="btn btn-ghost" onClick={handlePrev} disabled={currentIndex === 0}>
             <FaArrowLeft className="mr-1"/> Anterior
           </button>
           <button className="btn btn-ghost" onClick={handleNext} disabled={currentIndex === totalSteps - 1}>
             Próxima <FaArrowRight className="ml-1"/>
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