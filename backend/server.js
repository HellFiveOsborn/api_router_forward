const path = require('path');
const dotenvPath = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: dotenvPath }); // Carrega variáveis do .env na raiz (variáveis de ambiente do sistema têm precedência)
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
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// --- Rotas API --- (Movido para ANTES do static e forwarder)
app.use((req, res, next) => {
    // Loga toda requisição recebida (método, url, headers)
    console.log(`[GLOBAL LOG] ${req.method} ${req.originalUrl} | Content-Type: ${req.headers['content-type']}`);
    next();
});

app.post('/api/auth/login', (req, res) => {
    try {
        // Loga o body e o Content-Type para depuração
        console.log('[Auth] Content-Type:', req.headers['content-type']);
        console.log('[Auth] req.body:', req.body);

        let username, password;
        // Se body vier como string, tenta parsear manualmente
        if (typeof req.body === 'string') {
            try {
                const parsed = JSON.parse(req.body);
                username = parsed.username;
                password = parsed.password;
                console.log('[Auth] req.body foi string, parseado manualmente:', parsed);
            } catch (e) {
                console.error('[Auth] Falha ao parsear req.body como JSON:', e);
            }
        } else if (typeof req.body === 'object' && req.body !== null) {
            username = req.body.username;
            password = req.body.password;
        } else {
            console.warn('[Auth] req.body não é objeto nem string:', typeof req.body);
        }
        const validUser = process.env.USER;
        const validPassword = process.env.PASSWORD;
        const jwtSecret = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao';

        // Log útil para depuração de Content-Type/body
        if (!req.body) {
            console.warn('[Auth] req.body está undefined. Verifique o Content-Type da requisição (use application/json). Content-Type:', req.headers['content-type']);
        }

        if (!validUser || !validPassword) {
            console.error('[Auth] Variáveis USER e PASSWORD não definidas no .env ou ambiente.');
            return res.status(500).json({
                message: 'Erro interno: Configuração ausente. Defina USER e PASSWORD no arquivo .env ou nas variáveis de ambiente.',
                details: {
                    USER: !!validUser,
                    PASSWORD: !!validPassword,
                    JWT_SECRET: !!process.env.JWT_SECRET
                }
            });
        }

        if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
            return res.status(400).json({ message: 'Parâmetros inválidos. Envie JSON com { "username": "...", "password": "..." }.' });
        }

        if (jwtSecret === 'seu_segredo_jwt_padrao') {
            console.warn('AVISO: Usando chave JWT padrão!');
        }

        if (username === validUser && password === validPassword) {
            // Sanitiza e valida o expiresIn para evitar erro 500 quando valor inválido (ex.: 1d")
            let expiresIn = process.env.JWT_EXPIRATION || '1d';
            let token;
            try {
                token = jwt.sign({ username }, jwtSecret, { expiresIn });
            } catch (e) {
                console.error('[Auth] Valor inválido em JWT_EXPIRATION:', expiresIn, '— usando fallback "1d". Detalhe:', e && e.message);
                token = jwt.sign({ username }, jwtSecret, { expiresIn: '1d' });
            }
            return res.json({ token });
        }

        return res.status(401).json({ message: 'Credenciais inválidas' });
    } catch (err) {
        console.error('[Auth] Erro inesperado no login:', err);
        if (err && err.stack) {
            console.error('[Auth] Stack trace:', err.stack);
        }
        // Não delega para o error handler global para evitar mascarar a mensagem em produção
        return res.status(500).json({ message: 'Erro interno no processo de autenticação.', details: err && err.message });
    }
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
        // console.log(`Conectado ao banco de dados SQLite em: ${dbPath}`);
        db.run(`CREATE TABLE IF NOT EXISTS forwards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL,
      custom_route TEXT, url_destino TEXT NOT NULL, metodo TEXT NOT NULL,
      headers_in_config TEXT, headers_out_config TEXT, params_config TEXT,
      headers_validator_script TEXT, params_validator_script TEXT, response_script TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
            if (err) console.error("Erro ao criar tabela 'forwards':", err.message);
        });

        // Tabela de storage persistente (máx 5MB por chave)
        db.run(`CREATE TABLE IF NOT EXISTS forward_storage (
      forward_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (forward_id, key),
      FOREIGN KEY (forward_id) REFERENCES forwards(id) ON DELETE CASCADE
    )`, (err) => {
            if (err) console.error("Erro ao criar tabela 'forward_storage':", err.message);
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

// Nova API unificada e flexível
async function runScript(script, req, sharedContext, additionalContext = {}, scriptName = 'script', timeout = 5000, config = null) {
    if (!script || typeof script !== 'string' || script.trim() === '') {
        return scriptName === 'Manipulador de Resposta' ? undefined : true;
    }

    // Inicializa modificações se não existir
    if (!sharedContext.targetUrlModifications) {
        sharedContext.targetUrlModifications = {
            overrideUrl: null,
            addPath: null,
            replaceVars: {},
            removePath: null,
            queryParams: null,
            appendQueryParams: {},
            filterQueryKeys: null,
            methodOverride: null,
            responseCodeOverride: null
        };
    }

    // Objeto data unificado com todos os métodos
    const data = {
        // ===== MÉTODO HTTP =====
        getMethod: () => sharedContext.currentMethod || req.method,
        setMethod: (method) => {
            sharedContext.targetUrlModifications.methodOverride = method.toUpperCase();
        },

        // ===== CÓDIGO DE RESPOSTA =====
        responseCode: (code) => {
            sharedContext.targetUrlModifications.responseCodeOverride = code;
        },

        // ===== HEADERS =====
        getHeaders: () => ({ ...additionalContext.headers }) || {},
        setHeader: (keyOrObj, value) => {
            if (typeof keyOrObj === 'object') {
                Object.assign(additionalContext.headers, keyOrObj);
            } else {
                additionalContext.headers[keyOrObj] = value;
            }
        },
        removeHeader: (keyOrArray) => {
            if (Array.isArray(keyOrArray)) {
                keyOrArray.forEach(k => delete additionalContext.headers[k]);
            } else if (typeof keyOrArray === 'object') {
                Object.keys(keyOrArray).forEach(k => delete additionalContext.headers[k]);
            } else {
                delete additionalContext.headers[keyOrArray];
            }
        },

        // ===== ROTA DE ENTRADA =====
        getRoute: () => ({
            method: req.method,
            url: req.originalUrl,
            uri: req.path,
            protocol: req.protocol,
            host: req.get('host'),
            params: sharedContext.routeParams || {},
            query: req.query,
            headers: req.headers
        }),

        // ===== ROTA DE DESTINO =====
        getDestRoute: () => {
            const mods = sharedContext.targetUrlModifications;
            return {
                baseUrl: config?.url_destino || '',
                overrideUrl: mods.overrideUrl,
                addPath: mods.addPath,
                replaceVars: mods.replaceVars,
                removePath: mods.removePath,
                queryParams: mods.queryParams,
                appendQueryParams: mods.appendQueryParams,
                filterQueryKeys: mods.filterQueryKeys,
                method: mods.methodOverride || req.method
            };
        },
        setDestRoute: (modifications) => {
            const mods = sharedContext.targetUrlModifications;
            if (modifications.url) mods.overrideUrl = modifications.url;
            if (modifications.addPath) mods.addPath = modifications.addPath;
            if (modifications.replaceVars) mods.replaceVars = { ...mods.replaceVars, ...modifications.replaceVars };
            if (modifications.removePath) mods.removePath = modifications.removePath;
            if (modifications.query) mods.queryParams = modifications.query;
            if (modifications.appendQuery) mods.appendQueryParams = { ...mods.appendQueryParams, ...modifications.appendQuery };
            if (modifications.filter) mods.filterQueryKeys = modifications.filter;
            if (modifications.method) mods.methodOverride = modifications.method.toUpperCase();
        },

        // ===== BODY =====
        getBody: () => {
            if (additionalContext.body !== undefined) return additionalContext.body;
            if (additionalContext.query !== undefined) return additionalContext.query;
            return null;
        },
        setBody: (newBody) => {
            if (additionalContext.body !== undefined) {
                additionalContext.body = newBody;
            } else if (additionalContext.query !== undefined) {
                additionalContext.query = newBody;
            }
        },

        // ===== STORAGE (PERSISTENTE) =====
        getStorage: async (key) => {
            if (!config) return null;
            return new Promise((resolve, reject) => {
                db.get(
                    'SELECT value FROM forward_storage WHERE forward_id = ? AND key = ?',
                    [config.id, key],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row ? JSON.parse(row.value) : null);
                    }
                );
            });
        },
        setStorage: async (key, value) => {
            if (!config) return;
            const valueStr = JSON.stringify(value);
            if (Buffer.byteLength(valueStr, 'utf8') > 5 * 1024 * 1024) {
                throw new Error('Storage value exceeds 5MB limit');
            }
            return new Promise((resolve, reject) => {
                db.run(
                    'INSERT OR REPLACE INTO forward_storage (forward_id, key, value, updated_at) VALUES (?, ?, ?, datetime("now"))',
                    [config.id, key, valueStr],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        },
        delStorage: async (key) => {
            if (!config) return;
            return new Promise((resolve, reject) => {
                db.run(
                    'DELETE FROM forward_storage WHERE forward_id = ? AND key = ?',
                    [config.id, key],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        },

        // ===== EXCEÇÃO =====
        Exception: (errorOrMessage, statusCode = 400) => {
            const error = new Error(typeof errorOrMessage === 'string' ? errorOrMessage : errorOrMessage.message || 'Script Exception');
            error.statusCode = statusCode;
            error.isScriptException = true;
            if (typeof errorOrMessage === 'object') {
                error.details = errorOrMessage;
            }
            throw error;
        },

        // ===== RESPOSTA =====
        onResponse: (callback) => {
            sharedContext.responseCallback = callback;
        },
        setResponse: (response) => {
            sharedContext.responseOverride = response;
        },

        // ===== UTILITÁRIOS =====
        fetch: async (url, options = {}) => {
            try {
                const axiosConfig = {
                    url,
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    data: options.body,
                    responseType: 'arraybuffer',
                    validateStatus: () => true,
                };

                const response = await axios(axiosConfig);

                return {
                    ok: response.status >= 200 && response.status < 300,
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    json: () => JSON.parse(Buffer.from(response.data).toString('utf8')),
                    text: () => Buffer.from(response.data).toString('utf8'),
                    buffer: () => Buffer.from(response.data),
                };
            } catch (error) {
                throw new Error(`Erro em data.fetch para ${url}: ${error.message}`);
            }
        },

        // Alias para compatibilidade
        ctx: sharedContext
    };

    try {
        // Cria o sandbox com o objeto 'data' unificado
        const sandbox = vm.createContext({
            data,
            console: { log: console.log, warn: console.warn, error: console.error },
            setTimeout,
            Buffer,
            JSON,
            Math,
            Date,
            Object,
            String,
            Number,
            Array,
            RegExp
        });

        // Suporta dois formatos:
        // 1) Corpo puro do script (recomendado) -> será envolvido em (async (data) => { ... })
        // 2) Função completa (legado) -> (async (data) => { ... }) ou (data) => { ... } ou function(data) { ... }
        const rawScript = (script || '').trim();
        const looksLikeFunction = /^(\s*(async\s*)?\(\s*.*\)\s*=>|\s*function\s*\(|\s*\(\s*data\s*\)\s*=>)/.test(rawScript);
        // Adiciona uma quebra de linha antes do fechamento para evitar "Unexpected end of input" em alguns casos de comentários finais
        const wrappedScript = looksLikeFunction ? rawScript : `(async (data) => { ${rawScript}\n })`;

        // Executa a função
        const scriptFunction = vm.runInContext(wrappedScript, sandbox, { timeout });

        if (typeof scriptFunction !== 'function') {
            console.warn(`[Forwarder Middleware] ${scriptName} não definiu uma função válida.`);
            return scriptName === 'Manipulador de Resposta' ? undefined : true;
        }

        // Chama a função com o objeto data
        await scriptFunction(data);

        // Retorna baseado no tipo de script
        if (scriptName === 'Validador de Headers') {
            return additionalContext.headers;
        }
        if (scriptName === 'Validador de Parâmetros') {
            return additionalContext.body !== undefined ? additionalContext.body : additionalContext.query;
        }
        if (scriptName === 'Manipulador de Resposta') {
            if (sharedContext.responseOverride) {
                return sharedContext.responseOverride;
            }
            return { body: additionalContext.responseBody, headers: additionalContext.responseHeaders };
        }

        return true;
    } catch (thrownValue) {
        console.error(`[Forwarder Middleware] Erro durante a execução de ${scriptName}:`, thrownValue);

        // Trata exceções do script
        if (thrownValue.isScriptException) {
            throw thrownValue;
        }

        let errorToThrow;
        if (typeof thrownValue === 'object' && thrownValue !== null && thrownValue.message) {
            errorToThrow = new Error(thrownValue.message);
            errorToThrow.originalErrorObject = thrownValue;
            errorToThrow.code = thrownValue.code;
            errorToThrow.param = thrownValue.param;
        } else if (thrownValue instanceof Error) {
            errorToThrow = thrownValue;
        } else {
            errorToThrow = new Error(String(thrownValue));
        }

        errorToThrow.isScriptError = true;
        errorToThrow.scriptName = scriptName;

        throw errorToThrow;
    }
}

// --- Fim Helper Functions ---

// --- Função Auxiliar para Header de Trace ---
function setTraceHeaderIfNeeded(req, res, traceLog) {
    // Verifica se a requisição veio do Playground (ou outra fonte que deva receber o trace)
    if (req.headers['x-source'] === 'Playground') {
        try {
            // Cria uma cópia profunda para não modificar o original que pode ser usado em logs
            const traceLogCopy = JSON.parse(JSON.stringify(traceLog));

            // Limita o tamanho de campos potencialmente grandes ANTES de serializar/codificar
            Object.keys(traceLogCopy).forEach(key => {
                if (traceLogCopy[key] && traceLogCopy[key].data) {
                    const data = traceLogCopy[key].data;
                    // Limitar headers (exemplo: stringify e truncar se > 500 chars)
                    if (data.headers) {
                        const headersString = JSON.stringify(data.headers);
                        if (headersString.length > 500) {
                            data.headers = { info: `Headers omitidos (${headersString.length} bytes)` };
                        }
                    }
                    // Limitar bodyPreview
                    if (data.bodyPreview && data.bodyPreview.length > 500) {
                        data.bodyPreview = data.bodyPreview.substring(0, 500) + '... (truncado)';
                    }
                    // Limitar body (se for string)
                    if (data.body && typeof data.body === 'string' && data.body.length > 500) {
                        data.body = data.body.substring(0, 500) + '... (truncado)';
                    }
                    // Limitar stack trace
                    if (data.stack && data.stack.length > 500) {
                        data.stack = data.stack.substring(0, 500) + '... (truncado)';
                    }
                    // Limitar queryParams (exemplo)
                    if (data.queryParams) {
                        const queryString = JSON.stringify(data.queryParams);
                        if (queryString.length > 300) {
                            data.queryParams = { info: `Query Params omitidos (${queryString.length} bytes)` };
                        }
                    }
                    // Limitar routeParams (exemplo)
                    if (data.routeParams) {
                        const paramsString = JSON.stringify(data.routeParams);
                        if (paramsString.length > 200) {
                            data.routeParams = { info: `Route Params omitidos (${paramsString.length} bytes)` };
                        }
                    }
                }
            });

            const traceLogJson = JSON.stringify(traceLogCopy);
            const encodedTrace = Buffer.from(traceLogJson).toString('base64');

            // Define um limite razoável para o header Base64 (ex: 7.5KB)
            const MAX_HEADER_SIZE = 7500;
            if (encodedTrace.length < MAX_HEADER_SIZE) {
                console.log(`[Trace Header] Adicionando X-Forward-Trace codificado (${encodedTrace.length} bytes)`);
                res.set('X-Forward-Trace', encodedTrace);
            } else {
                console.warn(`[Trace Header] X-Forward-Trace codificado muito grande (${encodedTrace.length} bytes), omitindo.`);
                // Opcional: Adicionar um header indicando que o trace foi omitido por tamanho
                // res.set('X-Forward-Trace-Omitted', 'Size limit exceeded');
            }
        } catch (encodeError) {
            console.error('[Trace Header] Erro ao codificar ou definir X-Forward-Trace:', encodeError);
            // Opcional: Adicionar um header indicando erro no trace
            // res.set('X-Forward-Trace-Error', 'Encoding failed');
        }
    } else {
        // Log apenas se não for uma requisição de asset comum para não poluir logs
        if (!req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico)$/i)) {
            console.log(`[Trace Header] Requisição para ${req.path} não originada do Playground, X-Forward-Trace omitido.`);
        }
    }
}
// --- Fim Função Auxiliar ---


// --- Middleware de Encaminhamento --- (Movido para ANTES do static)
// Trata requisições que NÃO são para /api/*
app.use(async (req, res, next) => {
    // Se for rota da API (com ou sem barra no final), passa para o próximo handler (static/404)
    if (req.path === '/api' || req.path.startsWith('/api')) {
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

        // Inicializa objeto para manipulação da URL de destino
        sharedContext.targetUrlModifications = {
            overrideUrl: null,        // URL completa para substituir url_destino
            addPath: null,            // Path adicional para concatenar
            replaceVars: {},          // Variáveis para substituir na URL
            removePath: null,         // Regex para remover partes do path
            queryParams: null,        // Query params para definir (substitui)
            appendQueryParams: {},    // Query params para adicionar (mescla)
            filterQueryKeys: null     // Array de chaves permitidas para query params
        };

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

        // Validação de método - suporta array de métodos
        const allowedMethods = Array.isArray(config.metodo) ? config.metodo : [config.metodo];
        const isMethodAllowed = allowedMethods.some(m => m.toUpperCase() === method.toUpperCase());

        if (!isMethodAllowed) {
            const allowedMethodsStr = allowedMethods.join(', ');
            traceLog['method-validation'] = { status: 'error', data: { message: `Método ${method} não permitido. Esperado: ${allowedMethodsStr}` } };
            setTraceHeaderIfNeeded(req, res, traceLog);
            // Retorna 405 Method Not Allowed se o método não bate
            return res.status(405).json({ error: `Método ${method} não permitido para esta rota. Permitido: ${allowedMethodsStr}` });
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
        // LOG: Mostra o script de headers que será executado
        console.log('[DEBUG] Script de Headers recebido para execução:\n', config.headers_validator_script);

        // Passa headersToSend (que pode ter sido modificado) e sharedContext para o script
        let headerValidationResult = await runScript(config.headers_validator_script, req, sharedContext, { headers: headersToSend }, 'Validador de Headers', 5000, config);
        const headerValidationEndTime = performance.now();
        const headerValidationDuration = Math.round(headerValidationEndTime - headerValidationStartTime);

        // Erros lançados por runScript serão capturados pelo catch principal (linha 412)
        if (headerValidationResult === null) { // Apenas null bloqueia explicitamente. Erros (throw/return;) são tratados no catch.
            traceLog['header-validation'] = { status: 'error', time: headerValidationDuration, data: { message: "Bloqueado pelo script (retornou null)." } };
            setTraceHeaderIfNeeded(req, res, traceLog); // << MODIFICADO
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
        let paramsValidationResult = await runScript(config.params_validator_script, req, sharedContext, paramsContext, 'Validador de Parâmetros', 5000, config);
        const paramValidationEndTime = performance.now();
        const paramValidationDuration = Math.round(paramValidationEndTime - paramValidationStartTime);

        // Erros lançados por runScript serão capturados pelo catch principal (linha 412)
        if (paramsValidationResult === null) { // Apenas null bloqueia explicitamente. Erros (throw/return;) são tratados no catch.
            traceLog['param-validation'] = { status: 'error', time: paramValidationDuration, data: { message: "Bloqueado pelo script (retornou null).", type: paramsType } };
            setTraceHeaderIfNeeded(req, res, traceLog); // << MODIFICADO
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
            // 1. Verifica se há override completo da URL
            if (sharedContext.targetUrlModifications.overrideUrl) {
                targetUrl = sharedContext.targetUrlModifications.overrideUrl;
                console.log(`[Forwarder Middleware] URL de destino substituída por script: ${targetUrl}`);
            }

            // 2. Substitui {variavel} por valores de ctx (incluindo ctx.routeParams) e replaceVars
            const contextForUrl = {
                ...(sharedContext.routeParams || {}),
                ...sharedContext,
                ...sharedContext.targetUrlModifications.replaceVars
            };
            targetUrl = targetUrl.replace(/\{([^}]+)\}/g, (match, key) => {
                const value = contextForUrl[key.trim()];
                return value !== undefined ? encodeURIComponent(value) : match;
            });

            // Verifica se ainda existem placeholders não substituídos
            if (/\{[^}]+\}/.test(targetUrl)) {
                console.warn(`[Forwarder Middleware] URL de destino ainda contém placeholders não substituídos: ${targetUrl}`);
            }

            // 3. Anexa o wildcard path capturado ao target URL (se não houve override)
            if (!sharedContext.targetUrlModifications.overrideUrl) {
                let wildcardPath = sharedContext.routeParams?.wildcard;

                if (wildcardPath !== undefined) {
                    if (Array.isArray(wildcardPath)) {
                        wildcardPath = wildcardPath.join('/');
                    }

                    targetUrl = targetUrl.replace(/\/$/, '');

                    if (wildcardPath && wildcardPath.length > 0) {
                        const pathToAppend = wildcardPath.startsWith('/') ? wildcardPath : '/' + wildcardPath;
                        targetUrl += pathToAppend;
                        console.log(`[Forwarder Middleware] Wildcard path anexado: ${wildcardPath}`);
                    }
                }
            }

            // 4. Adiciona path extra se especificado
            if (sharedContext.targetUrlModifications.addPath) {
                targetUrl = targetUrl.replace(/\/$/, '');
                const pathToAdd = sharedContext.targetUrlModifications.addPath.startsWith('/')
                    ? sharedContext.targetUrlModifications.addPath
                    : '/' + sharedContext.targetUrlModifications.addPath;
                targetUrl += pathToAdd;
                console.log(`[Forwarder Middleware] Path adicional anexado: ${pathToAdd}`);
            }

            // 5. Remove padrão do path se especificado
            if (sharedContext.targetUrlModifications.removePath) {
                const originalUrl = targetUrl;
                targetUrl = targetUrl.replace(sharedContext.targetUrlModifications.removePath, '');
                if (originalUrl !== targetUrl) {
                    console.log(`[Forwarder Middleware] Path modificado por regex: ${originalUrl} -> ${targetUrl}`);
                }
            }

            console.log(`[Forwarder Middleware] URL de Destino Final: ${targetUrl}`);

            // 6. Aplicar modificações de query params
            if (sharedContext.targetUrlModifications.queryParams !== null) {
                // Substituir completamente os query params
                paramsToSend = sharedContext.targetUrlModifications.queryParams;
                console.log(`[Forwarder Middleware] Query params substituídos por script`);
            }

            // 7. Adicionar query params extras
            if (Object.keys(sharedContext.targetUrlModifications.appendQueryParams).length > 0) {
                paramsToSend = { ...paramsToSend, ...sharedContext.targetUrlModifications.appendQueryParams };
                console.log(`[Forwarder Middleware] Query params adicionados:`, sharedContext.targetUrlModifications.appendQueryParams);
            }

            // 8. Filtrar query params permitidos
            if (sharedContext.targetUrlModifications.filterQueryKeys !== null) {
                const allowedKeys = sharedContext.targetUrlModifications.filterQueryKeys;
                const filtered = {};
                for (const key of allowedKeys) {
                    if (paramsToSend[key] !== undefined) {
                        filtered[key] = paramsToSend[key];
                    }
                }
                paramsToSend = filtered;
                console.log(`[Forwarder Middleware] Query params filtrados para:`, allowedKeys);
            }

            // Incluir mais detalhes sobre a substituição de URL
            traceLog['url-substitution'] = {
                status: 'success',
                data: {
                    template: config.url_destino,
                    substitutedUrl: targetUrl,
                    hasPlaceholders: /\{[^}]+\}/.test(targetUrl),
                    routeParams: sharedContext.routeParams,
                    contextKeys: Object.keys(sharedContext),
                    urlModifications: sharedContext.targetUrlModifications
                }
            };
        } catch (substitutionError) {
            console.error(`[Forwarder Middleware] Erro ao substituir variáveis na URL de destino '${config.url_destino}':`, substitutionError);
            traceLog['url-substitution'] = { status: 'error', data: { template: config.url_destino, error: substitutionError.message } };
            setTraceHeaderIfNeeded(req, res, traceLog); // << MODIFICADO
            return res.status(500).json({ error: "Erro interno ao construir a URL de destino.", details: substitutionError.message });
        }

        // Envio para API de Destino
        console.log(`[Forwarder Middleware] Encaminhando para Destino Final: ${targetUrl}`);
        // --- DEBUG: Log detalhes da requisição para o destino ---
        console.log(`[DEBUG] Axios Request Config:`);
        console.log(`  Method: ${method.toLowerCase()}`);
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
                method: method.toLowerCase(), // Usa o método da requisição atual
                headers: headersToSend,
                body: dataToSend ? (typeof dataToSend === 'object' ? JSON.stringify(dataToSend) : dataToSend.toString()) : null,
                queryParams: paramsToSend
            }
        };
        const requestStartTime = performance.now();
        // Usa methodOverride se definido pelo script, senão usa o método original
        const finalMethod = (sharedContext.targetUrlModifications?.methodOverride || method).toLowerCase();
        const axiosConfig = {
            method: finalMethod,
            url: targetUrl, headers: headersToSend, params: paramsToSend, data: dataToSend,
            responseType: 'arraybuffer', validateStatus: () => true, timeout: 30000,
        };
        console.log(`[Forwarder Middleware] Método HTTP final: ${finalMethod.toUpperCase()}`);
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
        let scriptResult = await runScript(config.response_script, req, sharedContext, responseScriptContext, 'Manipulador de Resposta', 5000, config);
        const respManipulationEndTime = performance.now();
        const respManipulationDuration = Math.round(respManipulationEndTime - respManipulationStartTime);

        if (scriptResult instanceof Error) {
            traceLog['resp-manipulation'] = { status: 'error', time: respManipulationDuration, data: { message: "Erro interno ao executar script.", error: scriptResult.message } };
            setTraceHeaderIfNeeded(req, res, traceLog); // << MODIFICADO
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
        // Define o header de trace condicionalmente e codificado
        setTraceHeaderIfNeeded(req, res, traceLog); // << MODIFICADO

        // Envia a resposta final (forward bem-sucedido)
        // Usa responseCodeOverride se definido pelo script, senão usa o código original
        const finalStatusCode = sharedContext.targetUrlModifications?.responseCodeOverride || targetResponse.status;
        console.log(`[Forwarder Middleware] Código de resposta final: ${finalStatusCode}`);
        res.status(finalStatusCode).set(finalResponseHeaders).send(responseData);

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
            // Define o header de trace condicionalmente e codificado (mesmo em caso de erro)
            setTraceHeaderIfNeeded(req, res, traceLog); // << MODIFICADO

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
// console.log(`[Server] Verificando existência de frontend em: ${frontendDistPath}`); // Log para depuração
if (fs.existsSync(frontendDistPath)) {
    console.log(`Servindo arquivos estáticos do frontend de: ${frontendDistPath}`);
    // Serve arquivos estáticos apenas para rotas que NÃO são /api
    // Usa fallthrough: true para deixar o SPA fallback resolver quando o arquivo não existir
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        return express.static(frontendDistPath, { fallthrough: true })(req, res, next);
    });
    // Fallback para index.html para rotas SPA (requisições não-API/não-forward/não-arquivo-estático)
    app.use((req, res, next) => {
        // Verifica novamente se não é API (qualquer rota que comece com /api)
        if (!req.path.startsWith('/api')) {
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
            // Se chegou aqui como /api (com ou sem barra), deixa a cadeia seguir para 404 JSON da API
            next();
        }
    });
} else {
    // console.warn(`Diretório do frontend buildado (${frontendDistPath}) não encontrado. O frontend não será servido.`);
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
