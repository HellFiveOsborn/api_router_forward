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

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// --- Configuração do Banco de Dados ---
const dbDir = path.join(__dirname, 'db');
const dbPath = path.join(dbDir, 'database.sqlite');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Diretório criado: ${dbDir}`);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
  } else {
    console.log(`Conectado ao banco de dados SQLite em: ${dbPath}`);
    db.run(`CREATE TABLE IF NOT EXISTS forwards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL, -- Adicionado slug
      custom_route TEXT,
      url_destino TEXT NOT NULL,
      metodo TEXT NOT NULL,
      headers_in_config TEXT,
      headers_out_config TEXT,
      params_config TEXT,
      headers_validator_script TEXT,
      params_validator_script TEXT,
      response_script TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error("Erro ao criar tabela 'forwards':", err.message);
    });
  }
});
// --- Fim Configuração do Banco de Dados ---


// --- Rotas API ---
// Rota de Autenticação
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.USER;
  const validPassword = process.env.PASSWORD;
  const jwtSecret = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao';

  if (!validUser || !validPassword) {
      console.error("Variáveis USER e PASSWORD não definidas no .env");
      return res.status(500).json({ message: 'Erro interno: Configuração de autenticação ausente.' });
  }
   if (jwtSecret === 'seu_segredo_jwt_padrao') {
    console.warn("AVISO: Usando chave JWT padrão. Defina JWT_SECRET no seu arquivo .env!");
  }

  if (username === validUser && password === validPassword) {
    const token = jwt.sign({ username }, jwtSecret, { expiresIn: process.env.JWT_EXPIRATION || '1d' });
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Credenciais inválidas' });
  }
});

// Rota de Teste API
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// Rotas CRUD para Forwards
const forwardsRouter = require('./routes/forwards');
app.use('/api/forwards', forwardsRouter);
// --- Fim Rotas API ---


// --- Middleware de Encaminhamento (FINAL) ---
// Função auxiliar para executar scripts (copiada de forwarder.js)
function runScript(script, context, scriptName = 'script', timeout = 100) {
    if (!script || typeof script !== 'string' || script.trim() === '') return true;
    try {
        const sandbox = vm.createContext({ ...context, console: { log: console.log, warn: console.warn, error: console.error }, setTimeout });
        const wrappedScript = `(${script})`;
        const result = vm.runInContext(wrappedScript, sandbox, { timeout });
        if (typeof result === 'function') {
            // Executa a função do script com os argumentos apropriados
            // Passa os argumentos corretos, incluindo sharedContext, para cada tipo de script
            if (scriptName === 'Validador de Headers') return result(context.headers, context.sharedContext);
            if (scriptName === 'Validador de Parâmetros') return result(context[Object.keys(context).find(k => k !== 'sharedContext')], context.sharedContext); // Passa o argumento principal (body/query) e sharedContext
            if (scriptName === 'Manipulador de Resposta') return result(context.responseBody, context.responseHeaders, context.sharedContext);
            // Fallback genérico improvável de ser usado com a estrutura atual
            return result(...Object.values(context));
        } else {
             // Se o script não define uma função, considera um erro de script
             console.warn(`[Forwarder Middleware] ${scriptName} não definiu uma função.`);
             // Retorna um erro específico para diferenciar de falha de validação (null/undefined)
             return new Error(`Erro interno: ${scriptName} não definiu uma função.`);
        }
    } catch (error) {
        // Captura erros *durante a execução* do script ou do vm.runInContext
        console.error(`[Forwarder Middleware] Erro durante a execução de ${scriptName}:`, error);
        // Retorna o próprio erro para ser tratado no middleware principal
        return error; // Pode ser SyntaxError, ReferenceError, etc.
    }
}

// Middleware principal de encaminhamento
app.use(async (req, res, next) => {
    // Ignora rotas da API que já foram tratadas
    if (req.path.startsWith('/api/')) {
        return next();
    }

    const originalPath = req.originalUrl;
    const method = req.method;
    const requestBody = req.body;
    const requestHeaders = { ...req.headers };

    console.log(`\n--- [Forwarder Middleware] Recebida requisição ---`);
    console.log(`Path Original: ${originalPath}`);
    console.log(`Método: ${method}`);

    try {
        // Usa req.path que contém o caminho após o ponto de montagem (que é '/' aqui)
        const config = await forwardService.findBySlugAndPath(req.path);

        if (!config) {
            console.log(`[Forwarder Middleware] Rota não configurada para ${originalPath}`);
            // Se não encontrou config, passa para o próximo handler (que será o 404 do Express)
            return next();
        }

        console.log(`[Forwarder Middleware] Usando configuração: ${config.nome}`);

        if (config.metodo.toUpperCase() !== method.toUpperCase()) {
             console.log(`[Forwarder Middleware] Método não permitido: ${method}. Esperado: ${config.metodo}`);
             return res.status(405).json({ error: `Método ${method} não permitido para esta rota. Permitido: ${config.metodo}` });
        }

        let targetUrl = config.url_destino.replace(/\/$/, ''); // Remove barra final da URL base
        let remainingPath = '';

        // Extrai o slug e o subPath novamente para calcular o remainingPath
        const pathSegments = req.path.split('/').filter(Boolean);
        const slugFromPath = pathSegments[0]; // Já sabemos que corresponde ao config.slug
        const subPath = '/' + pathSegments.slice(1).join('/');

        // Determina o prefixo esperado (custom ou padrão)
        const expectedSubPathPrefix = config.custom_route ? config.custom_route.replace(/\/$/, '') : getDefaultPathFromUrl(config.url_destino);

        // O remainingPath é a parte do subPath que vem *depois* do prefixo esperado
        if (subPath.startsWith(expectedSubPathPrefix)) {
            remainingPath = subPath.substring(expectedSubPathPrefix.length);
        }
        // Garante que remainingPath comece com / se não estiver vazio
        if (remainingPath && !remainingPath.startsWith('/')) {
            remainingPath = '/' + remainingPath;
        }

        // Anexa o remainingPath à targetUrl (já sem barra final)
        targetUrl += remainingPath;

        const targetMethod = config.metodo.toLowerCase();
        let headersToSend = { ...requestHeaders }; // Alterado de const para let
        // Lógica de drop removida - será feita no script
        delete headersToSend['host'];
        delete headersToSend['connection'];
        delete headersToSend['content-length'];

        const sharedContext = {}; // Inicializa o contexto compartilhado para esta requisição
        let headerValidationResult = runScript(config.headers_validator_script, { headers: headersToSend, sharedContext }, 'Validador de Headers');

        // Verifica se houve erro na execução do script
        if (headerValidationResult instanceof Error) {
             console.error("[Forwarder Middleware] Erro na execução do script validador de headers:", headerValidationResult.message);
             return res.status(500).json({ error: "Erro interno ao executar script validador de headers.", details: headerValidationResult.message });
        }
        // Verifica se a validação falhou (script retornou null ou undefined)
        else if (headerValidationResult === null || headerValidationResult === undefined) {
             console.log("[Forwarder Middleware] Validação de Headers falhou (script retornou null/undefined).");
             return res.status(400).json({ error: "Requisição bloqueada pelo validador de headers." });
        }
        // Se passou, usa o resultado como os novos headers (pode ter sido modificado)
        else {
             console.log("[Forwarder Middleware] Validação de Headers OK. Headers (potencialmente modificados):", headerValidationResult);
             headersToSend = headerValidationResult; // Usa o resultado do script
        }

        let dataToSend = requestBody;
        let paramsToSend = req.query;
        const paramsConfig = config.params_config || {};
        const paramsType = paramsConfig.type || (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) ? 'body' : 'query');

        // Lógica de drop removida - será feita no script

        const paramsContext = { [paramsType]: paramsType === 'body' ? dataToSend : paramsToSend, sharedContext }; // Passa sharedContext
        let paramsValidationResult = runScript(config.params_validator_script, paramsContext, 'Validador de Parâmetros');

         // Verifica se houve erro na execução do script
        if (paramsValidationResult instanceof Error) {
             console.error(`[Forwarder Middleware] Erro na execução do script validador de parâmetros (${paramsType}):`, paramsValidationResult.message);
             return res.status(500).json({ error: `Erro interno ao executar script validador de parâmetros (${paramsType}).`, details: paramsValidationResult.message });
        }
        // Verifica se a validação falhou (script retornou null ou undefined)
        else if (paramsValidationResult === null || paramsValidationResult === undefined) {
             console.log(`[Forwarder Middleware] Validação de Parâmetros (${paramsType}) falhou (script retornou null/undefined).`);
             return res.status(400).json({ error: `Requisição bloqueada pelo validador de parâmetros (${paramsType}).` });
        }
         // Se passou, usa o resultado como os novos dados/params
        else {
             console.log(`[Forwarder Middleware] Validação de Parâmetros (${paramsType}) OK. Dados (potencialmente modificados):`, paramsValidationResult);
             if (paramsType === 'body') {
                 dataToSend = paramsValidationResult;
             } else {
                 paramsToSend = paramsValidationResult;
             }
        }

        console.log(`\n--- [Forwarder Middleware] Encaminhando para Destino ---`);
        console.log(`URL Destino Final: ${targetUrl}`);
        console.log(`Método Destino: ${targetMethod}`);

        const axiosConfig = {
            method: targetMethod, url: targetUrl, headers: headersToSend, params: paramsToSend, data: dataToSend,
            responseType: 'arraybuffer', validateStatus: () => true, timeout: 30000,
        };
        const targetResponse = await axios(axiosConfig);

        console.log(`\n--- [Forwarder Middleware] Resposta do Destino Recebida ---`);
        console.log(`Status: ${targetResponse.status}`);

        let responseData = targetResponse.data;
        let responseHeaders = { ...targetResponse.headers };
        // Lógica de drop removida - será feita no script de manipulação de resposta

        const scriptContext = { responseBody: responseData, responseHeaders: { ...responseHeaders }, sharedContext }; // Passa sharedContext
        let scriptExecutionResult = runScript(config.response_script, scriptContext, 'Manipulador de Resposta');

        // Verifica se houve erro na execução do script
        if (scriptExecutionResult instanceof Error) {
             console.error("[Forwarder Middleware] Erro na execução do script de manipulação de resposta:", scriptExecutionResult.message);
             return res.status(500).json({ error: "Erro interno ao executar o script de manipulação de resposta.", details: scriptExecutionResult.message });
        }
        // Se não houve erro de execução, o resultado é o corpo da resposta (modificado ou não)
        // O script pode retornar string, Buffer, null, undefined, etc.
        else if (scriptExecutionResult !== undefined) { // Verifica se o script retornou algo (não undefined)
             // Compara se o corpo foi modificado (considerando Buffer e outros tipos)
             const bodyChanged = !Buffer.isBuffer(scriptExecutionResult) || !Buffer.isBuffer(responseData) || Buffer.compare(responseData, scriptExecutionResult) !== 0;

             if (bodyChanged) {
                 console.log("[Forwarder Middleware] Corpo da resposta modificado pelo script.");
                 delete responseHeaders['content-length']; // Recalcular se modificado
             }
             responseData = scriptExecutionResult; // Usa o resultado do script como novo corpo
        }
        // Se scriptExecutionResult for undefined, responseData permanece o original.

        delete responseHeaders['transfer-encoding'];
        delete responseHeaders['connection'];
        delete responseHeaders['content-encoding'];
        delete responseHeaders['content-length'];

        console.log(`\n--- [Forwarder Middleware] Enviando Resposta ao Cliente ---`);
        console.log(`Status Final: ${targetResponse.status}`);

        res.status(targetResponse.status).set(responseHeaders).send(responseData);

    } catch (error) {
        console.error(`[Forwarder Middleware] Erro durante o processo de forwarding para ${originalPath}:`, error);
        if (axios.isAxiosError(error)) {
            const statusCode = error.response?.status || 502;
            const errorData = { error: `Erro ao contatar a API de destino.`, details: error.message, target_url: error.config?.url, target_status: error.response?.status };
            console.error("[Forwarder Middleware] Erro Axios:", errorData);
            res.status(statusCode).json(errorData);
        } else {
             console.error("[Forwarder Middleware] Erro Interno:", error.message);
            res.status(500).json({ error: "Erro interno do servidor durante o forwarding.", details: error.message });
        }
    }
});
// --- Fim Middleware de Encaminhamento ---


// --- Middleware 404 Personalizado (Captura rotas não encontradas) ---
// Este middleware só será alcançado se a requisição não corresponder a /api/*
// e também não corresponder a nenhum forward configurado no middleware anterior.
app.use((req, res, next) => {
  console.log(`[404 Handler] Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "Rota não encontrada",
    message: `O caminho solicitado '${req.originalUrl}' com o método ${req.method} não corresponde a nenhuma API ou configuração de forward válida.`,
    requestedPath: req.originalUrl,
    method: req.method
  });
});


// Middleware de tratamento de erros genérico (FINAL)
app.use((err, req, res, next) => {
  console.error("[Erro Não Tratado]", err.stack);
  res.status(500).send('Algo deu muito errado!');
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});

// Exportar db não é mais necessário aqui se o service o instancia
// module.exports = { db };