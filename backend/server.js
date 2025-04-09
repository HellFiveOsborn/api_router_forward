require('dotenv').config({ path: '../.env' }); // Carrega variáveis do .env na raiz (variáveis de ambiente do sistema têm precedência)
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const axios = require('axios'); // Importar axios
const vm = require('vm'); // Importar vm
const forwardService = require('./services/forwardService'); // Importar forwardService
const { URL } = require('url');
const { performance } = require('perf_hooks');
// const { compile } = require('path-to-regexp'); // Não mais necessário para URL de destino

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware padrão (Removidos os validadores de caminho anteriores)
app.use(cors({
  exposedHeaders: ['X-Forward-Trace'],
}));
app.use(bodyParser.json());

// --- Rotas API --- (Movido para ANTES do static e forwarder)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.USER; const validPassword = process.env.PASSWORD;
  const jwtSecret = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao';
  if (!validUser || !validPassword) return res.status(500).json({ message: 'Erro interno: Configuração ausente.' });
  if (jwtSecret === 'seu_segredo_jwt_padrao') console.warn("AVISO: Usando chave JWT padrão!");
  if (username === validUser && password === validPassword) {
    const token = jwt.sign({ username }, jwtSecret, { expiresIn: process.env.JWT_EXPIRATION || '1d' });
    res.json({ token });
  } else { res.status(401).json({ message: 'Credenciais inválidas' }); }
});
app.get('/api/ping', (req, res) => res.json({ message: 'pong' }));
const forwardsRouter = require('./routes/forwards');
app.use('/api/forwards', forwardsRouter);
// --- Fim Rotas API ---

// --- Configuração do Banco de Dados ---
const dbDir = path.join(__dirname, 'db');
const dbPath = path.join(dbDir, 'database.sqlite');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
  } else {
    console.log(`Conectado ao banco de dados SQLite em: ${dbPath}`);
    db.run(`CREATE TABLE IF NOT EXISTS forwards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL,
      custom_route TEXT, url_destino TEXT NOT NULL, metodo TEXT NOT NULL,
      headers_in_config TEXT, headers_out_config TEXT, params_config TEXT,
      headers_validator_script TEXT, params_validator_script TEXT, response_script TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error("Erro ao criar tabela 'forwards':", err.message);
    });
  }
});
// --- Fim Configuração do Banco de Dados ---

// --- Helper Functions ---
function getDefaultPathFromUrl(urlString) {
    try {
        const parsedUrl = new URL(urlString);
        const pathname = parsedUrl.pathname || '/';
        return pathname === '/' ? '/' : pathname.replace(/\/$/, '');
    } catch (e) { return '/'; }
}

function runScript(script, req, sharedContext, additionalContext = {}, scriptName = 'script', timeout = 100) {
    if (!script || typeof script !== 'string' || script.trim() === '') {
        return scriptName === 'Manipulador de Resposta' ? undefined : true; // Retorna undefined para resposta, true para validadores
    }

    // Constrói o objeto 'route'
    const route = {
        params: sharedContext.routeParams || {}, // Parâmetros da rota customizada
        url: req.originalUrl,
        query_params: req.query,
        uri: req.path,
        protocol: req.protocol,
        method: req.method, // Método original, não modificável pelo script
    };

    // O contexto compartilhado será acessível como 'ctx'
    const ctx = sharedContext;

    try {
        // Cria o sandbox com ctx, route, console, setTimeout e contexto adicional
        const sandbox = vm.createContext({
            ctx,
            route,
            console: { log: console.log, warn: console.warn, error: console.error },
            setTimeout,
            ...additionalContext // Adiciona headers, params (body/query), responseBody, etc.
        });
        const wrappedScript = `(${script})`;
        const result = vm.runInContext(wrappedScript, sandbox, { timeout });
        // Executa a função definida no script
        const scriptFunction = vm.runInContext(wrappedScript, sandbox, { timeout });

        if (typeof scriptFunction !== 'function') {
            console.warn(`[Forwarder Middleware] ${scriptName} não definiu uma função.`);
            // Para validadores, a ausência de função permite continuar. Para resposta, não faz nada.
            return scriptName === 'Manipulador de Resposta' ? undefined : true;
        }

        // Chama a função do script com os argumentos apropriados baseados no nome
        if (scriptName === 'Validador de Headers') {
            // Assinatura: (headers, ctx, route) => headers | null | undefined | Error
            return scriptFunction(additionalContext.headers, ctx, route);
        }
        if (scriptName === 'Validador de Parâmetros') {
            // Assinatura: (params, ctx, route) => params | null | undefined | Error
            // 'params' será o body ou query_params dependendo do método
            const paramsKey = Object.keys(additionalContext).find(k => k === 'body' || k === 'query');
            
            // Captura explicitamente o resultado para tratar retornos vazios (return;)
            const result = scriptFunction(additionalContext[paramsKey], ctx, route);
            
            // Se o resultado for undefined (return; sem valor), trata como erro de validação
            if (result === undefined) {
                throw new Error("Validação falhou sem mensagem específica");
            }
            
            return result;
        }
        if (scriptName === 'Manipulador de Resposta') {
            // Assinatura: (responseBody, responseHeaders, ctx, route) => { body, headers } | any
            const scriptResultObject = scriptFunction(additionalContext.responseBody, additionalContext.responseHeaders, ctx, route);
            // Verifica se retornou o objeto esperado { body, headers }
            if (typeof scriptResultObject === 'object' && scriptResultObject !== null && typeof scriptResultObject.headers === 'object') {
                return { body: scriptResultObject.body, headers: scriptResultObject.headers };
            } else {
                 console.warn(`[Forwarder Middleware] ${scriptName} não retornou um objeto { body, headers } válido. Usando retorno direto como corpo.`);
                 // Retorna o resultado direto como corpo e os headers originais da resposta
                 return { body: scriptResultObject, headers: additionalContext.responseHeaders };
            }
        }

        // Fallback genérico (não deve ser usado com os nomes atuais)
        console.warn(`[Forwarder Middleware] Chamada genérica para ${scriptName}. Verifique a lógica.`);
        return scriptFunction(); // Chama sem argumentos específicos se o nome não corresponder
    } catch (thrownValue) {
        console.error(`[Forwarder Middleware] Erro durante a execução de ${scriptName}:`, thrownValue);
        let errorToThrow;
        // Verifica se o valor lançado é um objeto com 'message' (convenção para erro customizado)
        if (typeof thrownValue === 'object' && thrownValue !== null && thrownValue.message) {
            errorToThrow = new Error(thrownValue.message); // Cria um Error real para ter stack trace
            errorToThrow.originalErrorObject = thrownValue; // Guarda o objeto original
            errorToThrow.code = thrownValue.code; // Copia code se existir
            errorToThrow.param = thrownValue.param; // Copia param se existir
        } else if (thrownValue instanceof Error) {
             errorToThrow = thrownValue; // Já é um Error
        } else {
             // Se lançou algo que não é Error nem objeto com message, converte para Error
             errorToThrow = new Error(String(thrownValue));
        }

        // Adiciona propriedades para identificar erros de script
        errorToThrow.isScriptError = true;
        errorToThrow.scriptName = scriptName; // Guarda o nome do script que falhou

        // Relança o erro (agora sempre um objeto Error)
        throw errorToThrow;
    }
}

// --- Middleware de Encaminhamento --- (Movido para ANTES do static)
// Trata requisições que NÃO são para /api/*
app.use(async (req, res, next) => {
    // Se for rota da API, já foi tratada acima, então passa para o próximo (static/404)
    if (req.path.startsWith('/api/')) {
        console.log(`[Router] Passando rota API ${req.path} para próximo handler (static/404)`);
        return next();
    }

    // Tenta tratar como um forward
    const overallStartTime = performance.now();
    const originalPath = req.originalUrl;
    const relevantPath = req.path;
    const method = req.method;
    const requestBody = req.body;
    const requestHeaders = { ...req.headers };
    const traceLog = {};
    const sharedContext = {};

    console.log(`\n--- [Forwarder Middleware] Recebida requisição para ${relevantPath} ---`);
    // Incluir mais detalhes sobre a requisição recebida
    traceLog['req-received'] = {
        status: 'success',
        time: 0,
        data: {
            method,
            originalPath,
            relevantPath,
            headers: requestHeaders,
            body: requestBody,
            query: req.query,
            timestamp: new Date().toISOString(),
            ip: req.ip || req.connection.remoteAddress
        }
    };

    try {
        const configLookupStartTime = performance.now();
        // findBySlugAndPath agora retorna { config, params } ou null
        const result = await forwardService.findBySlugAndPath(relevantPath);
        const configLookupEndTime = performance.now();

        if (!result) {
            traceLog['config-lookup'] = { status: 'not-found', time: Math.round(configLookupEndTime - configLookupStartTime), data: { message: 'Nenhuma configuração de forward encontrada para o path.' } };
            console.log(`[Forwarder Middleware] Nenhuma config encontrada para ${relevantPath}. Passando para próximo handler (static/404).`);
            return next(); // Passa para o próximo middleware (static/404)
        }
        const { config, params: routeParams } = result; // Extrai config e parâmetros da rota
        sharedContext.routeParams = routeParams || {}; // Adiciona parâmetros da rota ao contexto compartilhado

        // Incluir mais detalhes sobre a busca de configuração
        traceLog['config-lookup'] = {
            status: 'success',
            time: Math.round(configLookupEndTime - configLookupStartTime),
            data: {
                foundId: config.id,
                name: config.nome,
                slug: config.slug,
                customRoute: config.custom_route,
                targetUrlTemplate: config.url_destino,
                routeParams: sharedContext.routeParams,
                method: config.metodo,
                hasHeadersScript: !!config.headers_validator_script,
                hasParamsScript: !!config.params_validator_script,
                hasResponseScript: !!config.response_script
            }
        };
        console.log(`[Forwarder Middleware] Usando configuração: ${config.nome}`);

        if (config.metodo.toUpperCase() !== method.toUpperCase()) {
             traceLog['method-validation'] = { status: 'error', data: { message: `Método ${method} não permitido. Esperado: ${config.metodo}` } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             // Retorna 405 Method Not Allowed se o método não bate
             return res.status(405).json({ error: `Método ${method} não permitido para esta rota. Permitido: ${config.metodo}` });
        }
        traceLog['method-validation'] = { status: 'success' };

        // Validação/Modificação de Headers (Scripts podem adicionar dados ao sharedContext)
        let headersToSend = { ...requestHeaders }; // Começa com os headers originais

        // Lista de headers a serem removidos (lowercase para comparação insensível)
        const headersToRemove = [
            'host', 'connection', 'content-length', // Padrão
            'cdn-loop', // Cloudflare loop detection
            // Adicionar outros headers específicos de proxy/infraestrutura se necessário
        ];
        const prefixesToRemove = [
            'cf-', // Cloudflare headers
            'x-forwarded-', // Standard proxy headers
            'x-real-ip', // Common proxy header
        ];

        // Remove os headers indesejados
        for (const header in headersToSend) {
            const lowerHeader = header.toLowerCase();
            if (headersToRemove.includes(lowerHeader) || prefixesToRemove.some(prefix => lowerHeader.startsWith(prefix))) {
                console.log(`[Forwarder Middleware] Removendo header: ${header}`);
                delete headersToSend[header];
            }
        }
        const headerValidationStartTime = performance.now();
        // Passa headersToSend (que pode ter sido modificado) e sharedContext para o script
        let headerValidationResult = runScript(config.headers_validator_script, req, sharedContext, { headers: headersToSend }, 'Validador de Headers');
        const headerValidationEndTime = performance.now();
        const headerValidationDuration = Math.round(headerValidationEndTime - headerValidationStartTime);

        // Erros lançados por runScript serão capturados pelo catch principal (linha 412)
        if (headerValidationResult === null) { // Apenas null bloqueia explicitamente. Erros (throw/return;) são tratados no catch.
             traceLog['header-validation'] = { status: 'error', time: headerValidationDuration, data: { message: "Bloqueado pelo script (retornou null)." } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             return res.status(400).json({ error: "Requisição bloqueada pelo validador de headers (retornou null)." });
        } else {
             // Atualiza headersToSend com o resultado do script (pode ser o mesmo objeto modificado ou um novo)
             headersToSend = headerValidationResult;
             // Incluir mais detalhes sobre a validação de headers
             traceLog['header-validation'] = {
                 status: 'success',
                 time: headerValidationDuration,
                 data: {
                     headersAfterScript: headersToSend,
                     script: config.headers_validator_script ? "Script executado com sucesso" : "Sem script configurado",
                     scriptLength: config.headers_validator_script ? config.headers_validator_script.length : 0,
                     headersModified: JSON.stringify(requestHeaders) !== JSON.stringify(headersToSend)
                 }
             };
        }

        // Validação/Modificação de Parâmetros (Scripts podem adicionar dados ao sharedContext)
        let dataToSend = requestBody;
        let paramsToSend = req.query;
        // Determina se os parâmetros estão no corpo ou na query
        const paramsConfig = config.params_config || {};
        const paramsType = paramsConfig.type || (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) ? 'body' : 'query');
        const paramsKey = paramsType === 'body' ? 'body' : 'query';
        const paramsValue = paramsType === 'body' ? dataToSend : paramsToSend;
        const paramsContext = { [paramsKey]: paramsValue }; // Contexto adicional específico para este script
        const paramValidationStartTime = performance.now();
        // Passa req, sharedContext, e o contexto adicional (body ou query)
        let paramsValidationResult = runScript(config.params_validator_script, req, sharedContext, paramsContext, 'Validador de Parâmetros');
        const paramValidationEndTime = performance.now();
        const paramValidationDuration = Math.round(paramValidationEndTime - paramValidationStartTime);

        // Erros lançados por runScript serão capturados pelo catch principal (linha 412)
        if (paramsValidationResult === null) { // Apenas null bloqueia explicitamente. Erros (throw/return;) são tratados no catch.
             traceLog['param-validation'] = { status: 'error', time: paramValidationDuration, data: { message: "Bloqueado pelo script (retornou null).", type: paramsType } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             return res.status(400).json({ error: `Requisição bloqueada pelo validador de parâmetros (${paramsType}, retornou null).` });
        } else {
             // Atualiza dataToSend ou paramsToSend com o resultado do script
             if (paramsType === 'body') dataToSend = paramsValidationResult;
             else paramsToSend = paramsValidationResult;
             // Incluir mais detalhes sobre a validação de parâmetros
             traceLog['param-validation'] = {
                 status: 'success',
                 time: paramValidationDuration,
                 data: {
                     paramsAfterScript: paramsValidationResult,
                     type: paramsType,
                     script: config.params_validator_script ? "Script executado com sucesso" : "Sem script configurado",
                     scriptLength: config.params_validator_script ? config.params_validator_script.length : 0,
                     paramsModified: JSON.stringify(paramsValue) !== JSON.stringify(paramsValidationResult)
                 }
             };
        }

       // Construção FINAL da URL de Destino com substituição de variáveis do contexto
        let targetUrl = config.url_destino;
        try {
            // Substitui {variavel} por valores de ctx (incluindo ctx.routeParams)
            // Usa 'ctx' diretamente, pois ele já contém routeParams
            const contextForUrl = { ...(sharedContext.routeParams || {}), ...sharedContext }; // Usa sharedContext aqui
            targetUrl = targetUrl.replace(/\{([^}]+)\}/g, (match, key) => {
                // Busca o valor no contexto combinado
                const value = contextForUrl[key.trim()];
                // Codifica o valor se encontrado, senão mantém o placeholder
                return value !== undefined ? encodeURIComponent(value) : match;
            });

            // Verifica se ainda existem placeholders não substituídos (opcional, pode indicar erro de config)
            if (/\{[^}]+\}/.test(targetUrl)) {
                 console.warn(`[Forwarder Middleware] URL de destino ainda contém placeholders não substituídos: ${targetUrl}`);
                 // Considerar lançar erro se for crítico: throw new Error("Parâmetros ausentes para a URL de destino.");
            }

            console.log(`[Forwarder Middleware] URL de Destino Substituída: ${targetUrl}`);
            // Incluir mais detalhes sobre a substituição de URL
            traceLog['url-substitution'] = {
                status: 'success',
                data: {
                    template: config.url_destino,
                    substitutedUrl: targetUrl,
                    hasPlaceholders: /\{[^}]+\}/.test(targetUrl),
                    routeParams: sharedContext.routeParams,
                    contextKeys: Object.keys(sharedContext)
                }
            };
        } catch (substitutionError) {
            console.error(`[Forwarder Middleware] Erro ao substituir variáveis na URL de destino '${config.url_destino}':`, substitutionError);
            traceLog['url-substitution'] = { status: 'error', data: { template: config.url_destino, error: substitutionError.message } };
            res.set('X-Forward-Trace', JSON.stringify(traceLog));
            return res.status(500).json({ error: "Erro interno ao construir a URL de destino.", details: substitutionError.message });
        }

        // Envio para API de Destino
        console.log(`[Forwarder Middleware] Encaminhando para Destino Final: ${targetUrl}`);
        // --- DEBUG: Log detalhes da requisição para o destino ---
        console.log(`[DEBUG] Axios Request Config:`);
        console.log(`  Method: ${config.metodo.toLowerCase()}`);
        console.log(`  URL: ${targetUrl}`);
        console.log(`  Headers: ${JSON.stringify(headersToSend, null, 2)}`);
        console.log(`  Query Params: ${JSON.stringify(paramsToSend, null, 2)}`);
        // Logar o corpo apenas se existir e for razoavelmente pequeno (ou um tipo específico)
        if (dataToSend && typeof dataToSend !== 'object') { // Evita logar buffers grandes diretamente
             console.log(`  Body (dataToSend): ${JSON.stringify(dataToSend)}`);
        } else if (dataToSend) {
             console.log(`  Body (dataToSend): [Object/Buffer]`); // Indica que há um corpo, mas não loga o conteúdo completo
        } else {
             console.log(`  Body (dataToSend): null`);
        }
        console.log(`-------------------------------------------------`);
        // --- FIM DEBUG ---
        // Incluir mais detalhes no trace para o frontend
        traceLog['req-sent'] = {
            status: 'pending',
            data: {
                url: targetUrl,
                method: config.metodo.toLowerCase(),
                headers: headersToSend,
                body: dataToSend ? (typeof dataToSend === 'object' ? JSON.stringify(dataToSend) : dataToSend.toString()) : null,
                queryParams: paramsToSend
            }
        };
        const requestStartTime = performance.now();
        const axiosConfig = {
            method: config.metodo.toLowerCase(), url: targetUrl, headers: headersToSend, params: paramsToSend, data: dataToSend,
            responseType: 'arraybuffer', validateStatus: () => true, timeout: 30000,
        };
        const targetResponse = await axios(axiosConfig);
        const requestEndTime = performance.now();
        const requestDuration = Math.round(requestEndTime - requestStartTime);
        traceLog['req-sent'].status = 'success';
        traceLog['req-sent'].time = requestDuration;

        console.log(`[Forwarder Middleware] Resposta do Destino Recebida: ${targetResponse.status} (${requestDuration}ms)`);
        const originalResponseBody = Buffer.from(targetResponse.data);
        // --- DEBUG: Log detalhes da resposta recebida do destino ---
        console.log(`[DEBUG] Target Response Details:`);
        console.log(`  Status: ${targetResponse.status}`);
        console.log(`  Headers: ${JSON.stringify(targetResponse.headers, null, 2)}`);
        // Logar corpo como Base64 para visualização segura de qualquer tipo de dado
        console.log(`  Body Base64: ${originalResponseBody.toString('base64').substring(0, 200)}... (truncated)`); // Log truncado
        console.log(`-------------------------------------------------`);
        // --- FIM DEBUG ---
        // Incluir mais detalhes no trace para a resposta recebida
        let responseBodyPreview = '';
        try {
            // Tentar converter o corpo da resposta para string (limitado a 1000 caracteres)
            const contentType = targetResponse.headers['content-type'] || '';
            if (contentType.includes('json')) {
                const jsonBody = JSON.parse(originalResponseBody.toString('utf-8'));
                responseBodyPreview = JSON.stringify(jsonBody, null, 2).substring(0, 1000);
            } else if (contentType.includes('text') || contentType.includes('html') || contentType.includes('xml')) {
                responseBodyPreview = originalResponseBody.toString('utf-8').substring(0, 1000);
            } else {
                // Para outros tipos, usar base64 limitado
                responseBodyPreview = originalResponseBody.toString('base64').substring(0, 500) + '... (truncated)';
            }
        } catch (e) {
            responseBodyPreview = 'Não foi possível processar o corpo da resposta: ' + e.message;
        }
        
        traceLog['resp-received'] = {
            status: 'success',
            time: requestDuration,
            data: {
                status: targetResponse.status,
                statusText: targetResponse.statusText,
                headers: targetResponse.headers,
                bodyPreview: responseBodyPreview,
                contentType: targetResponse.headers['content-type'],
                contentLength: targetResponse.headers['content-length'] || originalResponseBody.length
            }
        };

       // Manipulação da Resposta
        let responseData = targetResponse.data;
        let responseHeaders = { ...targetResponse.headers };
        // Prepara o contexto adicional para o script de resposta
        const responseScriptContext = { responseBody: responseData, responseHeaders: { ...responseHeaders } };
        const respManipulationStartTime = performance.now();
        // Passa req, sharedContext, e o contexto adicional (responseBody, responseHeaders)
        let scriptResult = runScript(config.response_script, req, sharedContext, responseScriptContext, 'Manipulador de Resposta');
        const respManipulationEndTime = performance.now();
        const respManipulationDuration = Math.round(respManipulationEndTime - respManipulationStartTime);

        if (scriptResult instanceof Error) {
             traceLog['resp-manipulation'] = { status: 'error', time: respManipulationDuration, data: { message: "Erro interno ao executar script.", error: scriptResult.message } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             return res.status(500).json({ error: "Erro interno ao executar o script de manipulação de resposta.", details: scriptResult.message });
        }

        let finalResponseHeaders = { ...responseHeaders };
        let bodyModifiedByScript = false;
        let headersModifiedByScript = false;

        if (typeof scriptResult === 'object' && scriptResult !== null && scriptResult.headers && typeof scriptResult.headers === 'object') {
            finalResponseHeaders = { ...scriptResult.headers };
            headersModifiedByScript = JSON.stringify(responseHeaders) !== JSON.stringify(finalResponseHeaders);
            if (headersModifiedByScript) console.log("[Forwarder Middleware] Headers da resposta modificados pelo script.");

            if (scriptResult.body !== undefined) {
                 bodyModifiedByScript = !Buffer.isBuffer(scriptResult.body) || !Buffer.isBuffer(responseData) || Buffer.compare(responseData, scriptResult.body) !== 0;
                 if (bodyModifiedByScript) console.log("[Forwarder Middleware] Corpo da resposta modificado pelo script (via objeto retornado).");
                 responseData = scriptResult.body;
            } else {
                 bodyModifiedByScript = false;
            }
            // Incluir mais detalhes sobre a manipulação da resposta
            traceLog['resp-manipulation'] = {
                status: 'success',
                time: respManipulationDuration,
                data: {
                    returnType: 'object',
                    bodyModified: bodyModifiedByScript,
                    headersModified: headersModifiedByScript,
                    finalHeaders: finalResponseHeaders,
                    script: config.response_script ? "Script executado com sucesso" : "Sem script configurado",
                    scriptLength: config.response_script ? config.response_script.length : 0
                }
            };

        } else if (scriptResult !== undefined && scriptResult !== true) {
             console.warn("[Forwarder Middleware] Script de resposta não retornou { body, headers }.");
             bodyModifiedByScript = !Buffer.isBuffer(scriptResult) || !Buffer.isBuffer(responseData) || Buffer.compare(responseData, scriptResult) !== 0;
              if (bodyModifiedByScript) console.log("[Forwarder Middleware] Corpo da resposta modificado pelo script (retorno direto).");
             responseData = scriptResult;
             traceLog['resp-manipulation'] = { status: 'warning', time: respManipulationDuration, data: { returnType: 'direct_body', message: "Script não retornou { body, headers }.", bodyModified: bodyModifiedByScript, finalHeaders: finalResponseHeaders } };
        } else {
             bodyModifiedByScript = false;
             traceLog['resp-manipulation'] = { status: 'success', time: respManipulationDuration, data: { returnType: typeof scriptResult, info: "Nenhuma modificação aplicada pelo script.", finalHeaders: finalResponseHeaders } };
        }

        // Limpeza final dos headers
        delete finalResponseHeaders['transfer-encoding'];
        delete finalResponseHeaders['connection'];
        delete finalResponseHeaders['content-encoding'];
        if (bodyModifiedByScript) {
            delete finalResponseHeaders['content-length'];
        }

        // Envio da Resposta Final
        const overallEndTime = performance.now();
        const overallDuration = Math.round(overallEndTime - overallStartTime);
        console.log(`[Forwarder Middleware] Enviando Resposta ao Cliente: ${targetResponse.status} (Total: ${overallDuration}ms)`);
        // Incluir mais detalhes sobre o envio da resposta final
        traceLog['resp-sent'] = {
            status: 'success',
            time: Math.round(overallEndTime - respManipulationEndTime),
            data: {
                status: targetResponse.status,
                statusText: targetResponse.statusText,
                headers: finalResponseHeaders,
                totalDuration: overallDuration,
                bodyModified: bodyModifiedByScript,
                headersModified: headersModifiedByScript,
                contentType: finalResponseHeaders['content-type'],
                contentLength: finalResponseHeaders['content-length'] || 'N/A'
            }
        };
        // Garantir que o header X-Forward-Trace não seja muito grande
        // Remover dados muito grandes que podem causar problemas
        const traceLogCopy = JSON.parse(JSON.stringify(traceLog)); // Clone profundo
        
        // Limitar o tamanho dos dados em cada etapa
        Object.keys(traceLogCopy).forEach(key => {
            if (traceLogCopy[key] && traceLogCopy[key].data) {
                // Limitar headers para evitar headers muito grandes
                if (traceLogCopy[key].data.headers) {
                    const headersKeys = Object.keys(traceLogCopy[key].data.headers);
                    if (headersKeys.length > 10) {
                        const limitedHeaders = {};
                        headersKeys.slice(0, 10).forEach(headerKey => {
                            limitedHeaders[headerKey] = traceLogCopy[key].data.headers[headerKey];
                        });
                        limitedHeaders['...'] = `${headersKeys.length - 10} mais headers omitidos`;
                        traceLogCopy[key].data.headers = limitedHeaders;
                    }
                }
                
                // Limitar bodyPreview para evitar corpos muito grandes
                if (traceLogCopy[key].data.bodyPreview && traceLogCopy[key].data.bodyPreview.length > 500) {
                    traceLogCopy[key].data.bodyPreview = traceLogCopy[key].data.bodyPreview.substring(0, 500) + '... (truncado)';
                }
                
                // Limitar body para evitar corpos muito grandes
                if (traceLogCopy[key].data.body && typeof traceLogCopy[key].data.body === 'string' && traceLogCopy[key].data.body.length > 500) {
                    traceLogCopy[key].data.body = traceLogCopy[key].data.body.substring(0, 500) + '... (truncado)';
                }
            }
        });
        
        const traceLogJson = JSON.stringify(traceLogCopy);
        console.log(`Tamanho do X-Forward-Trace: ${traceLogJson.length} bytes`);
        
        // Se ainda for muito grande, fazer uma versão mais simplificada
        if (traceLogJson.length > 8000) {
            console.warn(`X-Forward-Trace muito grande (${traceLogJson.length} bytes), simplificando...`);
            
            // Versão simplificada com apenas status e tempo
            const simplifiedTrace = {};
            Object.keys(traceLogCopy).forEach(key => {
                if (traceLogCopy[key]) {
                    simplifiedTrace[key] = {
                        status: traceLogCopy[key].status,
                        time: traceLogCopy[key].time,
                        data: { info: "Dados completos omitidos devido ao tamanho" }
                    };
                }
            });
            
            res.set('X-Forward-Trace', JSON.stringify(simplifiedTrace));
        } else {
            res.set('X-Forward-Trace', traceLogJson);
        }
        // Envia a resposta final (forward bem-sucedido)
        res.status(targetResponse.status).set(finalResponseHeaders).send(responseData);

    } catch (error) {
        // Erro durante o processo de forwarding (depois de encontrar config)
        const overallEndTime = performance.now();
        const overallDuration = Math.round(overallEndTime - (overallStartTime || performance.now()));
        console.error(`[Forwarder Middleware] Erro durante o processo de forwarding para ${relevantPath} (Original: ${originalPath}, Duração: ${overallDuration}ms):`, error);

        if (!traceLog.error) traceLog.error = { status: 'error', time: overallDuration, data: {} };
        traceLog.error.data.message = error.message;
        traceLog.error.data.stack = error.stack; // Incluir stack para melhor depuração
        traceLog.error.data.type = axios.isAxiosError(error) ? 'axios' : 'internal'; // Tipo inicial

        if (!res.headersSent) {
            // Garantir que o header X-Forward-Trace não seja muito grande mesmo em caso de erro
            const traceLogCopy = JSON.parse(JSON.stringify(traceLog)); // Clone profundo
            
            // Limitar o tamanho dos dados em cada etapa
            Object.keys(traceLogCopy).forEach(key => {
                if (traceLogCopy[key] && traceLogCopy[key].data) {
                    // Limitar stack para evitar stacks muito grandes
                    if (traceLogCopy[key].data.stack && traceLogCopy[key].data.stack.length > 500) {
                        traceLogCopy[key].data.stack = traceLogCopy[key].data.stack.substring(0, 500) + '... (truncado)';
                    }
                    
                    // Limitar headers para evitar headers muito grandes
                    if (traceLogCopy[key].data.headers) {
                        const headersKeys = Object.keys(traceLogCopy[key].data.headers);
                        if (headersKeys.length > 10) {
                            const limitedHeaders = {};
                            headersKeys.slice(0, 10).forEach(headerKey => {
                                limitedHeaders[headerKey] = traceLogCopy[key].data.headers[headerKey];
                            });
                            limitedHeaders['...'] = `${headersKeys.length - 10} mais headers omitidos`;
                            traceLogCopy[key].data.headers = limitedHeaders;
                        }
                    }
                }
            });
            
            const traceLogJson = JSON.stringify(traceLogCopy);
            console.log(`Tamanho do X-Forward-Trace (erro): ${traceLogJson.length} bytes`);
            
            // Se ainda for muito grande, fazer uma versão mais simplificada
            if (traceLogJson.length > 8000) {
                console.warn(`X-Forward-Trace muito grande em erro (${traceLogJson.length} bytes), simplificando...`);
                
                // Versão simplificada com apenas status e mensagem de erro
                const simplifiedTrace = {};
                Object.keys(traceLogCopy).forEach(key => {
                    if (traceLogCopy[key]) {
                        simplifiedTrace[key] = {
                            status: traceLogCopy[key].status,
                            data: {
                                message: traceLogCopy[key].data?.message || "Erro sem mensagem",
                                info: "Dados completos omitidos devido ao tamanho"
                            }
                        };
                    }
                });
                
                res.set('X-Forward-Trace', JSON.stringify(simplifiedTrace));
            } else {
                res.set('X-Forward-Trace', traceLogJson);
            }

            // --- Formatação de Erro Padrão OpenAI ---
            let statusCode;
            let finalErrorResponse;

            if (axios.isAxiosError(error)) {
                statusCode = error.response?.status || 502; // Bad Gateway
                finalErrorResponse = {
                    error: {
                        message: `Erro ao contatar a API de destino: ${error.message}`,
                        type: "api_connection_error",
                        param: null,
                        code: null
                    }
                };
                // Tenta extrair detalhes do erro da API de destino
                if (error.response?.data) {
                    try {
                        const responseBodyString = Buffer.from(error.response.data).toString('utf-8');
                        const targetError = JSON.parse(responseBodyString);
                        if (targetError.error?.message) finalErrorResponse.error.message = targetError.error.message;
                        if (targetError.error?.type) finalErrorResponse.error.type = targetError.error.type;
                        if (targetError.error?.code) finalErrorResponse.error.code = targetError.error.code;
                    } catch (parseErr) { /* Ignora erro de parse */ }
                }
                console.error("[Forwarder Middleware] Erro Axios:", finalErrorResponse.error);

            } else if (error.isScriptError) {
                statusCode = 400; // Default para erro de script
                finalErrorResponse = {
                    error: {
                        message: error.message,
                        type: "invalid_request_error", // Default type para erro de script
                        param: error.param || null, // Usa 'param' se definido no throw
                        code: error.code || null    // Usa 'code' se definido no throw
                    }
                };
                // Tenta refinar 'code' e 'statusCode'
                if (error.message.toLowerCase().includes('timeout')) {
                    finalErrorResponse.error.code = 'script_timeout';
                    statusCode = 504; // Gateway Timeout
                } else if (error.message.toLowerCase().includes('formato inválido')) {
                     finalErrorResponse.error.code = 'invalid_format';
                } // Adicionar mais mapeamentos aqui...

                console.error(`[Forwarder Middleware] Erro no ${error.scriptName}:`, finalErrorResponse.error);

            } else {
                // Outro erro interno
                statusCode = 500;
                finalErrorResponse = {
                    error: {
                        message: error.message || "Erro interno do servidor.",
                        type: "internal_server_error",
                        param: null,
                        code: null
                    }
                };
                console.error("[Forwarder Middleware] Erro Interno:", finalErrorResponse.error);
            }

            // Envia a resposta formatada final
            res.status(statusCode).json(finalErrorResponse);
        }
        // Se headers já foram enviados, não podemos fazer mais nada aqui, o erro já foi logado.
    }
});
// --- Fim Middleware de Encaminhamento ---


// O middleware de encaminhamento anterior (linhas 108-365) foi atualizado e agora
// este bloco (linhas 369-577) é redundante e pode ser removido.
// A lógica atualizada já está no bloco que começa na linha 108.

// --- Servir Frontend Estático e SPA Fallback ---
// Deve vir DEPOIS da API e do Forwarder
const frontendDistPath = path.join(__dirname, 'frontend_dist'); // Usar join relativo ao diretório atual
console.log(`[Server] Verificando existência de frontend em: ${frontendDistPath}`); // Log para depuração
if (fs.existsSync(frontendDistPath)) {
  console.log(`Servindo arquivos estáticos do frontend de: ${frontendDistPath}`);
  // Serve arquivos estáticos
  app.use(express.static(frontendDistPath, {
      // Não chama next() se o arquivo não for encontrado,
      // permitindo que o próximo handler (sendFile) atue como fallback.
      fallthrough: false
  }));
  // Fallback para index.html para rotas SPA (requisições não-API/não-forward/não-arquivo-estático)
  app.use((req, res, next) => {
      // Verifica novamente se não é API (redundante, mas seguro)
      if (!req.path.startsWith('/api/')) {
          const indexPath = path.resolve(frontendDistPath, 'index.html'); // Usar resolve aqui também
          if (fs.existsSync(indexPath)) {
              console.log(`[SPA Fallback] Servindo index.html para: ${req.originalUrl}`);
              res.sendFile(indexPath);
          } else {
              console.error(`[SPA Fallback] Arquivo index.html não encontrado em ${frontendDistPath}`);
              // Se o index.html não existe, realmente é um 404
              res.status(404).json({ error: "Arquivo index.html do frontend não encontrado no build." });
          }
      } else {
          // Se chegou aqui como /api/*, é um 404 da API
          next();
      }
  });
} else {
  console.warn(`Diretório do frontend buildado (${frontendDistPath}) não encontrado. O frontend não será servido.`);
}
// --- Fim Servir Frontend Estático e SPA Fallback ---


// --- Middleware 404 Personalizado ---
app.use((req, res, next) => {
  console.log(`[404 Handler] Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "Rota não encontrada",
    message: `O caminho solicitado '${req.originalUrl}' com o método ${req.method} não corresponde a nenhuma API ou configuração de forward válida.`,
    requestedPath: req.originalUrl,
    method: req.method
  });
});


// --- Middleware de tratamento de erros (FINAL) ---
// Captura erros específicos do path-to-regexp e outros erros
app.use((err, req, res, next) => {
  // Verifica se é o erro específico do path-to-regexp
  if (err instanceof TypeError && err.message.startsWith('Missing parameter name')) {
    console.warn(`[Error Handler] Capturado erro de parâmetro ausente para ${req.originalUrl}: ${err.message}`);
    return res.status(400).json({
      error: "Caminho da requisição inválido.",
      message: "O caminho contém um padrão de parâmetro inválido ou malformado.",
      details: err.message
    });
  }

  // Tratamento de outros erros
  console.error("[Erro Não Tratado]", err.stack || err);
  const statusCode = err.status || err.statusCode || 500; // Usa status do erro se disponível
  const errorResponse = process.env.NODE_ENV === 'production' && statusCode === 500
      ? { error: 'Erro interno do servidor.' }
      : { error: err.message || 'Erro interno do servidor.', details: err.stack }; // Mostra mais detalhes em dev ou para erros não-500

  // Garante que a resposta não foi enviada ainda
  if (!res.headersSent) {
    res.status(statusCode).json(errorResponse);
  } else {
    // Se headers já foram enviados, apenas loga e encerra
     console.error("[Error Handler] Headers já enviados, não foi possível enviar resposta de erro JSON.");
     next(err); // Delega para o handler padrão do Express
  }
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
