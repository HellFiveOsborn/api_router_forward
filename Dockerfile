# ---- Base Node (Debian Slim) ----
FROM node:20-slim AS base
WORKDIR /app
RUN echo "Base Arch: $(uname -m)"

# ---- Frontend Builder ----
FROM base AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
# Declara os argumentos que podem ser passados pelo docker-compose build
ARG BASE_PATH=/
ARG VITE_API_URL=/api # Define um padrão caso não seja passado
# Define as variáveis de ambiente DENTRO deste estágio de build
# usando os valores dos ARGs (passados ou padrão)
ENV VITE_API_URL=${VITE_API_URL}
ENV BASE_PATH=${BASE_PATH}
# Executa o build (Vite usará VITE_API_URL do ambiente)
# Executa o build (Vite usará VITE_API_URL e BASE_PATH do ambiente do builder)
RUN npm run build -- --base=${BASE_PATH}
# Verifica se o index.html existe no build
RUN if [ ! -f "dist/index.html" ]; then echo "Erro: Arquivo 'dist/index.html' não encontrado após build do frontend!"; exit 1; fi

# ---- Backend Builder ----
FROM base AS backend-builder
WORKDIR /app/backend
RUN echo "Backend Builder Arch: $(uname -m)"
# Instala dependências de build
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*
# Copia manifests
COPY backend/package.json backend/package-lock.json* ./
# Instala dependências usando CI
RUN npm ci
# Copia o código restante
COPY backend/ ./
# Força a recompilação do sqlite3 a partir do código fonte
RUN npm rebuild sqlite3 --build-from-source

# ---- Final Stage ----
FROM node:20-slim AS final
WORKDIR /app
RUN echo "Final Stage Arch: $(uname -m)"
# Instala APENAS as bibliotecas runtime do SQLite necessárias
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 && rm -rf /var/lib/apt/lists/*

# Cria diretório do backend explicitamente
RUN mkdir -p backend

# Copia artefatos do backend-builder para /app/backend/
COPY --from=backend-builder /app/backend ./backend/

# Cria o diretório de destino para o frontend DENTRO de /app/backend
RUN mkdir -p /app/backend/frontend_dist

# Copia o CONTEÚDO de /app/frontend/dist para ./backend/frontend_dist/
COPY --from=frontend-builder /app/frontend/dist/ ./backend/frontend_dist/

# Verifica se a cópia funcionou e se o diretório e o index.html existem
RUN if [ ! -d "/app/backend/frontend_dist" ] || [ ! -f "/app/backend/frontend_dist/index.html" ]; then echo "Erro: Diretório '/app/backend/frontend_dist' ou 'index.html' não encontrado após a cópia!"; exit 1; fi

# Cria o diretório do banco de dados dentro de ./backend/db
RUN mkdir -p /app/backend/db

# Copia o script de entrypoint para /app
COPY entrypoint.sh /app/entrypoint.sh

# Define permissões:
# - Permite que 'node' escreva no diretório do DB
# - Permite que 'node' escreva na raiz /app (para criar .env)
# - Garante que 'node' seja dono de tudo dentro de /app
# - Torna o entrypoint executável
RUN chown -R node:node /app && chmod +x /app/entrypoint.sh

# Define o ambiente como produção
ENV NODE_ENV=production
ENV PORT=${PORT:-3001}
EXPOSE ${PORT}

# Define usuário não-root para segurança
USER node

# Define o diretório de trabalho final (onde o entrypoint espera estar)
WORKDIR /app

# Define o Entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Define o Comando padrão (passado como argumento para o entrypoint)
# O entrypoint fará 'cd backend' antes de executar isso
CMD ["node", "server.js"]