import React, { useState, useEffect } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript'; // Usado para JSON também
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup'; // Para HTML/XML
import 'prismjs/themes/prism-tomorrow.css';
import { FaDownload, FaFileAlt } from 'react-icons/fa';

// Estilos do editor (copiado/adaptado do Playground)
const editorStyles = {
  fontFamily: '"Fira code", "Fira Mono", monospace',
  fontSize: 14,
  outline: 0,
  border: '1px solid hsl(var(--b3))',
  borderRadius: 'var(--rounded-box, 1rem)',
  color: 'hsl(var(--bc))',
  minHeight: '10rem',
  overflow: 'auto',
};

function ResponseBodyRenderer({ blob, contentType, headers }) {
  const [content, setContent] = useState('');
  const [renderType, setRenderType] = useState('text'); // text, json, html, image, audio, video, pdf, download
  const [objectUrl, setObjectUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Limpa URL de objeto anterior ao desmontar ou mudar o blob
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
    };
  }, [blob]); // Dependência apenas no blob para limpeza

  useEffect(() => {
    if (!blob) {
      setContent('');
      setRenderType('text'); // Reset para texto padrão
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const type = contentType?.split(';')[0].toLowerCase() || 'application/octet-stream'; // Pega o tipo principal

    const processBlob = async () => {
      try {
        console.log(headers)
        if (type.includes('json')) {
          const text = await blob.text();
          try {
            const parsed = JSON.parse(text);
            setContent(JSON.stringify(parsed, null, 2)); // Formata
            setRenderType('json');
          } catch (e) {
            setContent(text); // Mostra como texto se não for JSON válido
            setRenderType('text');
            console.warn("Content-Type é JSON, mas o corpo não é válido.");
          }
        } else if (type.includes('html')) {
          const text = await blob.text();
          setContent(text);
          setRenderType('html');
        } else if (type.startsWith('text/')) {
          const text = await blob.text();
          setContent(text);
          setRenderType('text');
        } else if (type.startsWith('image/')) {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
          setRenderType('image');
          setContent(''); // Limpa conteúdo de texto/json
        } else if (type.startsWith('audio/')) {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
          setRenderType('audio');
          setContent('');
        } else if (type.startsWith('video/')) {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
          setRenderType('video');
          setContent('');
        } else if (type === 'application/pdf') {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
          setRenderType('pdf');
          setContent('');
        } else {
          // Outros tipos -> Oferece download
          const url = URL.createObjectURL(blob);
          setObjectUrl(url); // URL para o botão de download
          setRenderType('download');
          setContent('');
        }
      } catch (err) {
        console.error("Erro ao processar blob da resposta:", err);
        setError("Falha ao ler o corpo da resposta.");
        setContent('');
        setRenderType('text');
      } finally {
        setIsLoading(false);
      }
    };

    processBlob();

  }, [blob, contentType]); // Re-processa se blob ou contentType mudar

  const getHighlightLanguage = (type) => {
    if (type === 'json') return languages.json;
    if (type === 'html') return languages.markup;
    return languages.clike; // Default para texto
  };

  const getLanguageName = (type) => {
    if (type === 'json') return 'json';
    if (type === 'html') return 'markup';
    return 'clike';
  }

  const handleDownload = () => {
    if (!objectUrl || !blob) return;
    const link = document.createElement('a');
    link.href = objectUrl;
    // Tenta obter um nome de arquivo do header Content-Disposition, senão usa um genérico
    const disposition = headers?.['content-disposition'];
    let filename = `download.${contentType?.split('/')[1] || 'bin'}`; // Nome padrão
    if (disposition) {
      const filenameMatch = disposition.match(/filename\*?=['"]?([^'";]+)['"]?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return <div className="p-4 text-center"><span className="loading loading-dots loading-md"></span></div>;
  }

  if (error) {
    return <div className="p-4 text-error text-center text-sm">{error}</div>;
  }

  // Renderização condicional
  switch (renderType) {
    case 'json':
    case 'text':
      return (
        <Editor
          value={content}
          onValueChange={() => { }} // Read-only
          highlight={(code) => highlight(code || '', getHighlightLanguage(renderType), getLanguageName(renderType))}
          readOnly
          padding={'1rem'}
          style={editorStyles}
          textareaClassName="focus:outline-none"
          className="bg-base-300 rounded-box"
        />
      );
    case 'html':
      return (
        <iframe
          srcDoc={content}
          title="HTML Response Preview"
          sandbox="" // Sandbox para segurança
          className="w-full h-96 border border-base-300 rounded-box bg-white"
        />
      );
    case 'image':
      return <img src={objectUrl} alt="Response content" className="max-w-full h-auto rounded-box border border-base-300" />;
    case 'audio':
      return <audio controls src={objectUrl} className="w-full">Seu navegador não suporta o elemento de áudio.</audio>;
    case 'video':
      return <video controls src={objectUrl} className="max-w-full h-auto rounded-box border border-base-300">Seu navegador não suporta o elemento de vídeo.</video>;
    case 'pdf':
      return <embed src={objectUrl} type="application/pdf" className="w-full h-96 border border-base-300 rounded-box" />;
    case 'download':
      return (
        <div className="bg-base-300 rounded-box p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaFileAlt className="text-xl opacity-70" />
            <div>
              <div className="text-sm font-medium">Arquivo Recebido</div>
              <div className="text-xs opacity-70">Tipo: {contentType || 'Desconhecido'}</div>
              <div className="text-xs opacity-70">Tamanho: {blob ? (blob.size / 1024).toFixed(2) : '0'} KB</div>
            </div>
          </div>
          <button onClick={handleDownload} className="btn btn-sm btn-outline btn-primary">
            <FaDownload className="mr-1" /> Baixar
          </button>
        </div>
      );
    default:
      return <div className="p-4 text-sm italic opacity-70">Pré-visualização não disponível para este tipo de conteúdo.</div>;
  }
}

export default ResponseBodyRenderer;