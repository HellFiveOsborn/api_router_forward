# ---- Base Node (Debian Slim) ----
FROM node:20-slim AS base
# WORKDIR /app # Definir WORKDIR principal no estágio final
RUN echo "Base Arch: $(uname -m)"

# ---- Frontend Builder ----
FROM base AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
ARG BASE_PATH=/
RUN npm run build -- --base=${BASE_PATH}

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
# Define o WORKDIR principal
WORKDIR /app
RUN echo "Final Stage Arch: $(uname -m)"
# Instala APENAS as bibliotecas runtime do SQLite necessárias
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 && rm -rf /var/lib/apt/lists/*

# Cria diretórios necessários
RUN mkdir -p backend/db frontend_dist

# Copia artefatos do backend-builder para /app/backend
COPY --from=backend-builder /app/backend ./backend/

# Copia os arquivos estáticos construídos do frontend para /app/frontend_dist
COPY --from=frontend-builder /app/frontend/dist ./frontend_dist/

# Define permissões:
# - Permite que 'node' escreva no diretório do DB
# - Permite que 'node' escreva na raiz /app (para criar .env)
# - Garante que 'node' seja dono de tudo dentro de /app
RUN chown -R node:node /app && \
    chmod -R u+w /app/backend/db /app

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