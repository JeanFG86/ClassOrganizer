# syntax=docker/dockerfile:1.7
# Imagem única multi-stage para api, worker, migrate e web.
# Build a partir da raiz do repositório: docker build -f infra/docker/Dockerfile --target api .

ARG NODE_IMAGE=node:24.22.1-alpine3.24
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine3.24

# ---------- base com pnpm ----------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    PRISMA_HIDE_UPDATE_MESSAGE=1
RUN npm install -g pnpm@10.34.7 && apk add --no-cache openssl
WORKDIR /app

# ---------- fonte + dependências completas (inclui desenvolvimento) ----------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter '!@classorganizer/e2e'
RUN pnpm --filter @classorganizer/web build

# ---------- dependências de produção ----------
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --prod
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --prod --ignore-scripts \
      --filter @classorganizer/api... --filter @classorganizer/worker...
# O cliente Prisma é gerado no estágio de build (o CLI é dependência de desenvolvimento).
COPY --from=build /app/packages/infrastructure/src/generated packages/infrastructure/src/generated
RUN rm -rf apps/web tests docs infra

# ---------- runtime Node sem pnpm ----------
FROM ${NODE_IMAGE} AS node-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app /app
USER node

# ---------- api ----------
FROM node-runtime AS api
ENV API_HOST=0.0.0.0 API_PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/api/src/main.ts"]

# ---------- worker ----------
FROM node-runtime AS worker
ENV WORKER_HEARTBEAT_FILE=/tmp/worker.alive
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "apps/worker/src/healthcheck.ts"]
CMD ["node", "apps/worker/src/main.ts"]

# ---------- migrate (executa uma vez antes da aplicação) ----------
FROM build AS migrate
WORKDIR /app/packages/infrastructure
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# ---------- web (arquivos estáticos + proxy da API) ----------
FROM ${NGINX_IMAGE} AS web
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/"]
