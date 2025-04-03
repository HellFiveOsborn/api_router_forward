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
WORKDIR /app/backend
RUN echo "Final Stage Arch: $(uname -m)"
# Instala APENAS as bibliotecas runtime do SQLite necessárias
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 && rm -rf /var/lib/apt/lists/*

# Copia artefatos do backend-builder para o WORKDIR atual (/app/backend)
COPY --from=backend-builder /app/backend .

# Cria o diretório de destino para o frontend DENTRO do WORKDIR atual (/app/backend)
RUN mkdir -p frontend_dist

# Copia o CONTEÚDO de /app/frontend/dist para ./frontend_dist/
COPY --from=frontend-builder /app/frontend/dist/ ./frontend_dist/

# Verifica se a cópia funcionou e se o diretório e o index.html existem
RUN if [ ! -d "frontend_dist" ] || [ ! -f "frontend_dist/index.html" ]; then echo "Erro: Diretório 'frontend_dist' ou 'frontend_dist/index.html' não encontrado após a cópia!"; exit 1; fi

# Cria o diretório do banco de dados dentro de ./db
RUN mkdir -p db

# Define permissões para o usuário node no diretório WORKDIR atual (/app/backend)
RUN chown -R node:node /app/backend

# Define o ambiente como produção
ENV NODE_ENV=production
ENV PORT=${PORT:-3001}
EXPOSE ${PORT}

# Define usuário não-root para segurança
USER node

# WORKDIR já é /app/backend

# Comando para iniciar o servidor backend, com um ls antes para depuração final
CMD ls -lA /app/backend && echo "--- Iniciando Node ---" && node server.js