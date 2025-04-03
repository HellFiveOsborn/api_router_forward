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
ARG BASE_PATH=/
RUN npm run build -- --base=${BASE_PATH}
# Verifica se a pasta dist existe e não está vazia após o build
RUN if [ ! -d "dist" ] || [ -z "$(ls -A dist)" ]; then echo "Erro: Diretório 'dist' não encontrado ou vazio após build do frontend!"; exit 1; fi
RUN echo "--- Conteúdo /app/frontend/dist ---" && ls -lA dist

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
# Copia manifests E código primeiro
COPY backend/package.json backend/package-lock.json* ./
COPY backend/ ./
# Instala dependências
RUN npm install
# Força a recompilação do sqlite3 a partir do código fonte
RUN npm rebuild sqlite3 --build-from-source

# ---- Final Stage ----
FROM node:20-slim AS final
# Define WORKDIR principal como /app
WORKDIR /app
RUN echo "Final Stage Arch: $(uname -m)"
# Instala APENAS as bibliotecas runtime do SQLite necessárias
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 && rm -rf /var/lib/apt/lists/*

# Cria diretório do backend explicitamente
RUN mkdir -p backend

# Copia artefatos do backend-builder para /app/backend/
COPY --from=backend-builder /app/backend ./backend/

# Copia os arquivos estáticos construídos do frontend para /app/frontend_dist/ (um nível acima do backend)
COPY --from=frontend-builder /app/frontend/dist ./frontend_dist/

# Debug: Verifica se a cópia funcionou e se o diretório não está vazio
RUN echo "--- Conteúdo /app/frontend_dist ---" && ls -lA /app/frontend_dist && if [ -z "$(ls -A /app/frontend_dist)" ]; then echo "Aviso: /app/frontend_dist está vazio!"; fi

# Cria o diretório do banco de dados dentro de /app/backend/db
RUN mkdir -p /app/backend/db

# Define permissões para o usuário node em todo o diretório /app
RUN chown -R node:node /app

# Define o ambiente como produção
ENV NODE_ENV=production
ENV PORT=${PORT:-3001}
EXPOSE ${PORT}

# Define usuário não-root para segurança
USER node

# Define o diretório de trabalho para o comando CMD
WORKDIR /app/backend

# Comando para iniciar o servidor backend
CMD ["node", "server.js"]