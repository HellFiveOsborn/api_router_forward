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
# Instala dependências (usando install em vez de ci)
RUN npm install
# Força a recompilação do sqlite3 a partir do código fonte
RUN npm rebuild sqlite3 --build-from-source

# ---- Final Stage ----
FROM node:20-slim AS final
WORKDIR /app/backend
RUN echo "Final Stage Arch: $(uname -m)"
# As bibliotecas runtime do SQLite (libsqlite3-0) devem estar presentes

# Copia primeiro node_modules e package*.json do builder
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package.json ./package.json
COPY --from=backend-builder /app/backend/package-lock.json* ./package-lock.json

# Copia o restante do código compilado do backend (sem sobrescrever node_modules)
COPY --from=backend-builder /app/backend ./

# Copia os arquivos estáticos construídos do frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend_dist

# Define o ambiente como produção
ENV NODE_ENV=production
ENV PORT=${PORT:-3001}
EXPOSE ${PORT}

# Define usuário não-root para segurança
USER node

# Comando para iniciar o servidor backend
CMD ["node", "server.js"]