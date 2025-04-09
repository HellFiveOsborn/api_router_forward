// backend/services/forwardService.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const slugify = require('slugify');
const { URL } = require('url');
const { match } = require('path-to-regexp'); // Importar match
// --- Database Connection ---
const dbPath = path.join(__dirname, '../db/database.sqlite');
let db;

try {
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        if (err.code === 'SQLITE_CANTOPEN') {
            console.warn(`Arquivo de banco de dados não encontrado em ${dbPath}. Será criado pelo server.js se necessário.`);
        } else {
            console.error('Erro ao conectar ao SQLite no forwardService:', err.message);
        }
      }
    });
} catch (error) {
    console.error("Falha crítica ao instanciar o Database SQLite:", error);
    db = { // Mock DB para evitar erros em cascata
        all: (sql, params, cb) => cb(new Error("DB não inicializado"), null),
        get: (sql, params, cb) => cb(new Error("DB não inicializado"), null),
        run: (sql, params, cb) => cb(new Error("DB não inicializado")),
    };
}

// --- Helper Functions ---

// Função auxiliar para parsear JSON de configuração com segurança
const parseJsonConfig = (jsonStringOrObject, defaultValue) => {
    if (typeof jsonStringOrObject === 'object' && jsonStringOrObject !== null) {
        return jsonStringOrObject; // Já é um objeto
    }
    if (typeof jsonStringOrObject === 'string') {
        try {
            return JSON.parse(jsonStringOrObject);
        } catch (e) {
            // console.warn("Falha ao parsear config JSON, usando default:", jsonStringOrObject, e); // Log muito verboso
            return defaultValue;
        }
    }
    return defaultValue; // Retorna default se for null, undefined ou outro tipo
};

// Função auxiliar para derivar path padrão da URL
function getDefaultPathFromUrl(urlString) {
    try {
        const parsedUrl = new URL(urlString);
        // Retorna o pathname, garantindo que comece com /
        const pathname = parsedUrl.pathname || '/';
        return pathname === '/' ? '/' : pathname.replace(/\/$/, ''); // Remove barra final se não for raiz
    } catch (e) {
        console.warn(`[Forward Service] URL de destino inválida para derivar path padrão: ${urlString}`);
        return '/'; // Retorna raiz como fallback
    }
}

// Função para gerar slug
const generateSlug = (name) => {
    if (!name) return null;
    return slugify(name, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
};

// --- Service Object ---
const forwardService = {
  getAll: () => {
    return new Promise((resolve, reject) => {
      if (!db || typeof db.all !== 'function') return reject("Instância do DB inválida.");
      // Seleciona todos os campos necessários, incluindo slug
      const sql = `SELECT id, nome, slug, custom_route, url_destino, metodo,
                          headers_in_config, headers_out_config, params_config,
                          headers_validator_script, params_validator_script, response_script,
                          updated_at
                   FROM forwards ORDER BY nome`;
      db.all(sql, [], (err, rows) => {
        try { // Adiciona try...catch abrangente
            if (err) {
              // Rejeita a Promise se houver erro no DB
              console.error("Erro DB em getAll:", err.message);
              return reject("Erro ao buscar forwards no DB: " + err.message);
            }
            // Parseia os campos JSON para cada linha antes de retornar
            const parsedRows = (rows || []).map(row => {
                // O try...catch interno apenas loga o erro de parse, mas não interrompe
                try {
                    row.headers_in_config = parseJsonConfig(row.headers_in_config, {});
                    row.headers_out_config = parseJsonConfig(row.headers_out_config, {});
                    row.params_config = parseJsonConfig(row.params_config, { type: row.metodo === 'GET' ? 'query' : 'body' });
                } catch (parseError) {
                     console.error(`Erro ao parsear JSON para forward ID ${row.id} em getAll:`, parseError);
                     // Considerar lançar um erro aqui se o parse for crítico,
                     // mas por enquanto apenas logamos e continuamos.
                }
                return row;
            });
            // Resolve a Promise com os dados parseados
            resolve(parsedRows);
        } catch (processingError) {
            // Captura qualquer outro erro durante o processamento (ex: erro no .map)
            console.error("Erro ao processar resultados em getAll:", processingError);
            reject("Erro interno ao processar a lista de forwards.");
        }
      });
    });
  },

  getById: (id) => {
    return new Promise((resolve, reject) => {
       if (!db || typeof db.get !== 'function') return reject("Instância do DB inválida.");
       const sql = "SELECT * FROM forwards WHERE id = ?";
       db.get(sql, [id], (err, row) => {
        if (err) {
          return reject("Erro ao buscar forward por ID: " + err.message);
        }
        if (!row) {
          return resolve(null); // Não encontrado
        }
        // Parsear JSONs
        try {
            row.headers_in_config = parseJsonConfig(row.headers_in_config, {});
            row.headers_out_config = parseJsonConfig(row.headers_out_config, {});
            row.params_config = parseJsonConfig(row.params_config, { type: row.metodo === 'GET' ? 'query' : 'body' });
        } catch (parseError) {
             console.error(`Erro ao parsear JSON para forward ID ${id}:`, parseError);
        }
        resolve(row);
      });
    });
  },

  create: (forwardData) => {
    return new Promise((resolve, reject) => {
       if (!db || typeof db.run !== 'function') return reject("Instância do DB inválida.");
      const { nome, custom_route, url_destino, metodo, headers_in_config = {}, headers_out_config = {}, params_config = {}, headers_validator_script = '', params_validator_script = '', response_script = '' } = forwardData;

      if (!nome || !url_destino || !metodo) {
        return reject("Campos obrigatórios (nome, url_destino, metodo) não fornecidos.");
      }

      const slug = generateSlug(nome);
      if (!slug) {
          return reject("Não foi possível gerar um slug válido a partir do nome fornecido.");
      }

      const sql = `INSERT INTO forwards (
        nome, slug, custom_route, url_destino, metodo,
        headers_in_config, headers_out_config, params_config,
        headers_validator_script, params_validator_script, response_script,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

      const params = [
        nome, slug, custom_route || null, url_destino, metodo,
        JSON.stringify(headers_in_config), JSON.stringify(headers_out_config), JSON.stringify(params_config),
        headers_validator_script, params_validator_script, response_script
      ];

      db.run(sql, params, function(err) {
        if (err) {
           if (err.message.includes('UNIQUE constraint failed')) {
               const field = err.message.includes('.slug') ? 'slug' : 'nome';
               reject(`Erro ao criar forward: O ${field} '${field === 'slug' ? slug : nome}' já está em uso.`);
           } else {
               reject("Erro ao criar forward: " + err.message);
           }
        } else {
          forwardService.getById(this.lastID).then(resolve).catch(reject);
        }
      });
    });
  },

  update: (id, forwardData) => {
    return new Promise((resolve, reject) => {
       if (!db || typeof db.run !== 'function') return reject("Instância do DB inválida.");
       const { nome, custom_route, url_destino, metodo, headers_in_config, headers_out_config, params_config, headers_validator_script, params_validator_script, response_script } = forwardData;

       const fieldsToUpdate = [];
       const params = [];
       const addField = (field, value, stringify = false) => {
           if (value !== undefined) {
               fieldsToUpdate.push(`${field} = ?`);
               params.push(stringify ? JSON.stringify(value) : value);
           }
       };

       if (nome !== undefined) {
           addField('nome', nome);
           const newSlug = generateSlug(nome);
            if (!newSlug) {
                return reject("Não foi possível gerar um slug válido a partir do novo nome fornecido.");
            }
           addField('slug', newSlug);
       }
       addField('custom_route', custom_route);
       addField('url_destino', url_destino);
       addField('metodo', metodo);
       addField('headers_in_config', headers_in_config, true);
       addField('headers_out_config', headers_out_config, true);
       addField('params_config', params_config, true);
       addField('headers_validator_script', headers_validator_script);
       addField('params_validator_script', params_validator_script);
       addField('response_script', response_script);

       if (fieldsToUpdate.length === 0) {
         return forwardService.getById(id).then(resolve).catch(reject);
       }

       fieldsToUpdate.push("updated_at = CURRENT_TIMESTAMP");
       params.push(id);

       const sql = `UPDATE forwards SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

       db.run(sql, params, function(err) {
         if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                const field = err.message.includes('.slug') ? 'slug' : 'nome';
                const value = field === 'slug' ? generateSlug(nome) : nome;
                reject(`Erro ao atualizar forward: O ${field} '${value}' já está em uso por outro registro.`);
            } else {
               reject("Erro ao atualizar forward: " + err.message);
            }
         } else if (this.changes === 0) {
           resolve(null); // ID não encontrado
         } else {
            forwardService.getById(id).then(resolve).catch(reject);
         }
       });
    });
  },

  delete: (id) => {
    return new Promise((resolve, reject) => {
       if (!db || typeof db.run !== 'function') return reject("Instância do DB inválida.");
       const sql = "DELETE FROM forwards WHERE id = ?";
       db.run(sql, [id], function(err) {
         if (err) {
           reject("Erro ao deletar forward: " + err.message);
         } else if (this.changes === 0) {
           resolve(null); // ID não encontrado
         } else {
           resolve({ message: `Forward com ID ${id} deletado com sucesso.`, id: id });
         }
       });
    });
  },

  // Modificada para suportar path parameters
  findBySlugAndPath: (reqPath) => {
    return new Promise((resolve, reject) => {
      if (!db || typeof db.all !== 'function') return reject("Instância do DB inválida.");

      // 1. Buscar todas as configurações
      const sql = "SELECT * FROM forwards";
      db.all(sql, [], (err, rows) => {
        if (err) return reject(`Erro ao buscar todas as configurações de forward: ${err.message}`);
        if (!rows || rows.length === 0) return resolve(null); // Nenhuma configuração encontrada

        let matchedConfig = null;
        let extractedParams = {};

        // 2. Iterar e tentar fazer match
        for (const row of rows) {
          let patternToMatch = '';

          if (row.custom_route) {
            // Usar slug + custom_route
            patternToMatch = `/${row.slug}${row.custom_route.startsWith('/') ? row.custom_route : '/' + row.custom_route}`;
            
            // Tratar wildcard '*' no final especificamente para path-to-regexp
            if (patternToMatch.endsWith('/*')) {
              // Substituir '/*' por '/(.*)' ou apenas '(.*)' se for a raiz '/*'
              patternToMatch = patternToMatch === '/*' ? '(.*)' : patternToMatch.slice(0, -2) + '(.*)';
            } else if (patternToMatch.endsWith('*') && !patternToMatch.endsWith('/*')) {
              // Tratar '*' no final não precedido por '/' (ex: /files*)
              // Isso pode significar "match qualquer coisa começando com /files"
              patternToMatch = patternToMatch.slice(0, -1) + '(.*)';
            }
          } else {
            // Fallback: Construir padrão a partir do slug e path da URL de destino + wildcard
            let routePatternBase = getDefaultPathFromUrl(row.url_destino);
            // Garantir que o path base não termine com barra antes de adicionar wildcard
            routePatternBase = routePatternBase.replace(/\/$/, '');
            // Se o path base for vazio (raiz '/'), tratar corretamente
            patternToMatch = `/${row.slug}${routePatternBase || ''}(.*)`;
          }

          try {
            console.log(`[Forward Service] Tentando match para ${reqPath} com padrão '${patternToMatch}' (ID: ${row.id})`);
            console.log(`[Forward Service] custom_route: ${row.custom_route}, url_destino: ${row.url_destino}, slug: ${row.slug}`);

            const matcher = match(patternToMatch, { decode: decodeURIComponent, strict: false });
            const matchResult = matcher(reqPath);

            if (matchResult) {
              console.log(`[Forward Service] Match encontrado para ${reqPath} com padrão ${patternToMatch} (ID: ${row.id})`);
              matchedConfig = row;
              // Combinar parâmetros de path com possível match de wildcard (param '0')
              extractedParams = matchResult.params || {};
              break; // Encontrou o primeiro match, para a iteração
            }
          } catch (matchError) {
            // Logar o padrão específico que causou o erro
            console.error(`[Forward Service] Erro ao tentar match com padrão '${patternToMatch}' para ID ${row.id}:`, matchError);
            // Continua tentando outros padrões
          }
        }

        // 3. Se encontrou um match, parseia JSON e retorna
        if (matchedConfig) {
          try {
            matchedConfig.headers_in_config = parseJsonConfig(matchedConfig.headers_in_config, {});
            matchedConfig.headers_out_config = parseJsonConfig(matchedConfig.headers_out_config, {});
            matchedConfig.params_config = parseJsonConfig(matchedConfig.params_config, { type: matchedConfig.metodo === 'GET' ? 'query' : 'body' });
          } catch (parseError) {
            console.error(`Erro ao parsear JSON para forward ID ${matchedConfig.id} em findBySlugAndPath:`, parseError);
            // Rejeitar se o parse falhar? Ou retornar config parcialmente parseada? Por ora, rejeita.
            return reject(`Erro ao parsear configuração JSON para o forward ID ${matchedConfig.id}`);
          }
          // Retorna a configuração e os parâmetros extraídos
          resolve({ config: matchedConfig, params: extractedParams });
        } else {
          // Nenhum match encontrado
          resolve(null);
        }
      });
    });
  },
};

module.exports = forwardService;
