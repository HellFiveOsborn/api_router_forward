require('dotenv').config({ path: '../.env' }); // Carrega variáveis do .env na raiz
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Importar axios
const vm = require('vm'); // Importar vm
const forwardService = require('./services/forwardService'); // Importar forwardService
const { URL } = require('url'); // Para parsear URL de destino
const { performance } = require('perf_hooks'); // Para medir tempo

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors({
  exposedHeaders: ['X-Forward-Trace'],
}));
app.use(bodyParser.json());

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

function runScript(script, context, scriptName = 'script', timeout = 100) {
    if (!script || typeof script !== 'string' || script.trim() === '') {
        return scriptName === 'Manipulador de Resposta' ? undefined : true;
    }
    try {
        const sandbox = vm.createContext({ ...context, console: { log: console.log, warn: console.warn, error: console.error }, setTimeout });
        const wrappedScript = `(${script})`;
        const result = vm.runInContext(wrappedScript, sandbox, { timeout });
        if (typeof result === 'function') {
            if (scriptName === 'Validador de Headers') return result(context.headers, context.sharedContext);
            if (scriptName === 'Validador de Parâmetros') return result(context[Object.keys(context).find(k => k !== 'sharedContext')], context.sharedContext);
            if (scriptName === 'Manipulador de Resposta') {
                const scriptResultObject = result(context.responseBody, context.responseHeaders, context.sharedContext);
                if (typeof scriptResultObject === 'object' && scriptResultObject !== null && typeof scriptResultObject.headers === 'object') {
                    return { body: scriptResultObject.body, headers: scriptResultObject.headers };
                } else {
                     console.warn(`[Forwarder Middleware] ${scriptName} não retornou um objeto { body, headers } válido.`);
                     return { body: scriptResultObject, headers: context.responseHeaders };
                }
            }
            return result(...Object.values(context));
        } else {
             console.warn(`[Forwarder Middleware] ${scriptName} não definiu uma função.`);
             return new Error(`Erro interno: ${scriptName} não definiu uma função.`);
        }
    } catch (error) {
        console.error(`[Forwarder Middleware] Erro durante a execução de ${scriptName}:`, error);
        return error;
    }
}

// --- Rotas API ---
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


// --- Middleware de Encaminhamento (FINAL) ---
app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();

    const overallStartTime = performance.now(); // Tempo inicial geral
    const originalPath = req.originalUrl;
    const method = req.method;
    const requestBody = req.body;
    const requestHeaders = { ...req.headers };
    const traceLog = {};
    const sharedContext = {};

    console.log(`\n--- [Forwarder Middleware] Recebida requisição ---`);
    console.log(`Path Original: ${originalPath}`);
    console.log(`Método: ${method}`);
    traceLog['req-received'] = { status: 'success', time: 0, data: { method, originalPath, headers: requestHeaders, body: requestBody } };

    try {
        const configLookupStartTime = performance.now();
        const config = await forwardService.findBySlugAndPath(req.path);
        const configLookupEndTime = performance.now();

        if (!config) {
            traceLog['config-lookup'] = { status: 'error', time: Math.round(configLookupEndTime - configLookupStartTime), data: { message: 'Nenhuma configuração encontrada.' } };
            console.log(`[Forwarder Middleware] Rota não configurada para ${originalPath}`);
            return next();
        }
        traceLog['config-lookup'] = { status: 'success', time: Math.round(configLookupEndTime - configLookupStartTime), data: { foundId: config.id, name: config.nome, slug: config.slug, customRoute: config.custom_route, targetUrl: config.url_destino } };
        console.log(`[Forwarder Middleware] Usando configuração: ${config.nome}`);

        if (config.metodo.toUpperCase() !== method.toUpperCase()) {
             traceLog['method-validation'] = { status: 'error', data: { message: `Método ${method} não permitido. Esperado: ${config.metodo}` } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             return res.status(405).json({ error: `Método ${method} não permitido para esta rota. Permitido: ${config.metodo}` });
        }
        traceLog['method-validation'] = { status: 'success' };

        // Construção da URL de destino
        let targetUrl = config.url_destino.replace(/\/$/, '');
        let remainingPath = '';
        const pathSegments = req.path.split('/').filter(Boolean);
        const subPath = '/' + pathSegments.slice(1).join('/');
        const expectedSubPathPrefix = config.custom_route ? config.custom_route.replace(/\/$/, '') : getDefaultPathFromUrl(config.url_destino);
        if (subPath.startsWith(expectedSubPathPrefix)) {
            remainingPath = subPath.substring(expectedSubPathPrefix.length);
        }
        if (remainingPath && !remainingPath.startsWith('/')) {
            remainingPath = '/' + remainingPath;
        }
        targetUrl += remainingPath;

        // Validação/Modificação de Headers
        let headersToSend = { ...requestHeaders };
        delete headersToSend['host']; delete headersToSend['connection']; delete headersToSend['content-length'];
        const headerValidationStartTime = performance.now();
        let headerValidationResult = runScript(config.headers_validator_script, { headers: headersToSend, sharedContext }, 'Validador de Headers');
        const headerValidationEndTime = performance.now();
        const headerValidationDuration = Math.round(headerValidationEndTime - headerValidationStartTime);

        if (headerValidationResult instanceof Error) {
             traceLog['header-validation'] = { status: 'error', time: headerValidationDuration, data: { message: "Erro interno ao executar script.", error: headerValidationResult.message } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             return res.status(500).json({ error: "Erro interno ao executar script validador de headers.", details: headerValidationResult.message });
        } else if (headerValidationResult === null || headerValidationResult === undefined) {
             traceLog['header-validation'] = { status: 'error', time: headerValidationDuration, data: { message: "Bloqueado pelo script (retornou null/undefined)." } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             return res.status(400).json({ error: "Requisição bloqueada pelo validador de headers." });
        } else {
             traceLog['header-validation'] = { status: 'success', time: headerValidationDuration, data: { headersBefore: requestHeaders, headersAfter: headerValidationResult } };
             headersToSend = headerValidationResult;
        }

        // Validação/Modificação de Parâmetros
        let dataToSend = requestBody;
        let paramsToSend = req.query;
        const paramsConfig = config.params_config || {};
        const paramsType = paramsConfig.type || (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) ? 'body' : 'query');
        const paramsContext = { [paramsType]: paramsType === 'body' ? dataToSend : paramsToSend, sharedContext };
        const paramValidationStartTime = performance.now();
        let paramsValidationResult = runScript(config.params_validator_script, paramsContext, 'Validador de Parâmetros');
        const paramValidationEndTime = performance.now();
        const paramValidationDuration = Math.round(paramValidationEndTime - paramValidationStartTime);

        if (paramsValidationResult instanceof Error) {
             traceLog['param-validation'] = { status: 'error', time: paramValidationDuration, data: { message: "Erro interno ao executar script.", error: paramsValidationResult.message, type: paramsType } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             return res.status(500).json({ error: `Erro interno ao executar script validador de parâmetros (${paramsType}).`, details: paramsValidationResult.message });
        } else if (paramsValidationResult === null || paramsValidationResult === undefined) {
             traceLog['param-validation'] = { status: 'error', time: paramValidationDuration, data: { message: "Bloqueado pelo script (retornou null/undefined).", type: paramsType } };
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             return res.status(400).json({ error: `Requisição bloqueada pelo validador de parâmetros (${paramsType}).` });
        } else {
             const originalParams = paramsType === 'body' ? requestBody : req.query;
             traceLog['param-validation'] = { status: 'success', time: paramValidationDuration, data: { paramsBefore: originalParams, paramsAfter: paramsValidationResult, type: paramsType } };
             if (paramsType === 'body') dataToSend = paramsValidationResult;
             else paramsToSend = paramsValidationResult;
        }

        // Envio para API de Destino
        console.log(`\n--- [Forwarder Middleware] Encaminhando para Destino ---`);
        console.log(`URL Destino Final: ${targetUrl}`);
        console.log(`Método Destino: ${config.metodo.toLowerCase()}`);
        traceLog['req-sent'] = { status: 'pending', data: { url: targetUrl, method: config.metodo.toLowerCase(), headers: headersToSend, body: dataToSend, queryParams: paramsToSend } };
        const requestStartTime = performance.now(); // Marca tempo antes do axios
        const axiosConfig = {
            method: config.metodo.toLowerCase(), url: targetUrl, headers: headersToSend, params: paramsToSend, data: dataToSend,
            responseType: 'arraybuffer', validateStatus: () => true, timeout: 30000,
        };
        const targetResponse = await axios(axiosConfig);
        const requestEndTime = performance.now(); // Marca tempo depois do axios
        const requestDuration = Math.round(requestEndTime - requestStartTime);
        traceLog['req-sent'].status = 'success';
        traceLog['req-sent'].time = requestDuration; // Adiciona tempo à etapa de envio

        console.log(`\n--- [Forwarder Middleware] Resposta do Destino Recebida ---`);
        console.log(`Status: ${targetResponse.status} (${requestDuration}ms)`);
        // Armazena corpo original (como base64 para segurança e consistência)
        const originalResponseBody = Buffer.from(targetResponse.data);
        traceLog['resp-received'] = { status: 'success', time: requestDuration, data: { status: targetResponse.status, headers: targetResponse.headers, originalBodyBase64: originalResponseBody.toString('base64') } }; // Log corpo original em base64

        // Manipulação da Resposta
        let responseData = targetResponse.data; // Buffer
        let responseHeaders = { ...targetResponse.headers };
        const scriptContext = { responseBody: responseData, responseHeaders: { ...responseHeaders }, sharedContext };
        const respManipulationStartTime = performance.now();
        let scriptResult = runScript(config.response_script, scriptContext, 'Manipulador de Resposta');
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
            traceLog['resp-manipulation'] = { status: 'success', time: respManipulationDuration, data: { returnType: 'object', bodyModified: bodyModifiedByScript, headersModified: headersModifiedByScript, finalHeaders: finalResponseHeaders } };

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
        console.log(`\n--- [Forwarder Middleware] Enviando Resposta ao Cliente ---`);
        console.log(`Status Final: ${targetResponse.status} (Total: ${overallDuration}ms)`);
        traceLog['resp-sent'] = { status: 'success', time: Math.round(overallEndTime - respManipulationEndTime), data: { status: targetResponse.status, headers: finalResponseHeaders, totalDuration: overallDuration } };
        res.set('X-Forward-Trace', JSON.stringify(traceLog));
        res.status(targetResponse.status).set(finalResponseHeaders).send(responseData);

    } catch (error) {
        const overallEndTime = performance.now();
        const overallDuration = Math.round(overallEndTime - overallStartTime);
        console.error(`[Forwarder Middleware] Erro durante o processo de forwarding para ${originalPath} (${overallDuration}ms):`, error);
        // Garante que traceLog.error exista antes de tentar adicionar dados
        if (!traceLog.error) traceLog.error = { status: 'error', time: overallDuration, data: {} };
        traceLog.error.data.message = error.message;
        traceLog.error.data.stack = error.stack;
        traceLog.error.data.type = axios.isAxiosError(error) ? 'axios' : 'internal';

        if (axios.isAxiosError(error)) {
            const statusCode = error.response?.status || 502;
            const errorData = { error: `Erro ao contatar a API de destino.`, details: error.message, target_url: error.config?.url, target_status: error.response?.status };
            traceLog.error.data = { ...traceLog.error.data, ...errorData }; // Mescla dados do erro Axios
            console.error("[Forwarder Middleware] Erro Axios:", errorData);
            res.set('X-Forward-Trace', JSON.stringify(traceLog));
            res.status(statusCode).json(errorData);
        } else {
             console.error("[Forwarder Middleware] Erro Interno:", error.message);
             res.set('X-Forward-Trace', JSON.stringify(traceLog));
             res.status(500).json({ error: "Erro interno do servidor durante o forwarding.", details: error.message });
        }
    }
});
// --- Fim Middleware de Encaminhamento ---


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


// --- Middleware de tratamento de erros genérico (FINAL) ---
app.use((err, req, res, next) => {
  console.error("[Erro Não Tratado]", err.stack);
  const errorResponse = process.env.NODE_ENV === 'production'
      ? { error: 'Erro interno do servidor.' }
      : { error: 'Erro interno do servidor.', details: err.message, stack: err.stack };
  res.status(500).json(errorResponse);
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});