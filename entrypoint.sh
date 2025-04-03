#!/bin/sh
# entrypoint.sh - Script para garantir a existência do .env e iniciar a aplicação

# Define o caminho esperado para o .env na raiz do app
ENV_FILE="/app/.env"
BACKEND_DIR="/app/backend"

echo "--- Iniciando Entrypoint ---"

# Verifica se o arquivo .env NÃO existe
if [ ! -f "$ENV_FILE" ]; then
  echo "Arquivo .env não encontrado em $ENV_FILE. Criando a partir das variáveis de ambiente..."

  # Cria o arquivo .env e adiciona as variáveis
  # Usa ':=' para fornecer um valor padrão se a variável de ambiente estiver vazia ou não definida
  # Importante: Use aspas duplas para permitir a expansão da variável, mas cuidado com caracteres especiais.
  # Redireciona a saída do bloco para o arquivo .env
  {
    echo "USER=${USER:=admin}"
    echo "PASSWORD=${PASSWORD:=password}"
    echo "BACKEND_PORT=${BACKEND_PORT:=3001}"
    # VITE_API_URL é mais para o build, mas incluímos por consistência se o backend precisar
    echo "VITE_API_URL=${VITE_API_URL:=/api}"
    # Gera um segredo padrão se não fornecido (NÃO SEGURO PARA PRODUÇÃO REAL)
    echo "JWT_SECRET=${JWT_SECRET:=fallback_secret_$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 16)}"
    echo "JWT_EXPIRATION=${JWT_EXPIRATION:=1d}"
    # Adicione outras variáveis de ambiente que seu backend possa precisar ler do .env
    # Exemplo: echo "DATABASE_URL=${DATABASE_URL}"
  } > "$ENV_FILE"

  echo ".env criado com sucesso em $ENV_FILE."
  # Garante que o usuário 'node' seja o dono do arquivo criado
  # (Assumindo que o entrypoint roda como root inicialmente antes do USER node no Dockerfile)
  # Se o entrypoint rodar como 'node', este chown não é necessário ou falhará.
  # Vamos omitir por enquanto, pois o chown no Dockerfile deve cobrir /app.
  # chown node:node "$ENV_FILE"
else
  echo "Arquivo .env encontrado em $ENV_FILE. Usando o arquivo existente."
fi

# Muda para o diretório do backend
cd "$BACKEND_DIR" || exit 1 # Sai se não conseguir mudar de diretório

# Executa o comando principal da aplicação (passado como argumentos para este script)
# Geralmente será "node", "server.js"
echo "Executando comando principal: $@"
exec "$@"