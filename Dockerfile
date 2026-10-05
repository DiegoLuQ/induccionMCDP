# ---------------------------------------------------------------------------
# Etapa 1: dependencias
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------------------
# Etapa 2: compilación (prisma generate + next build)
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

# ---------------------------------------------------------------------------
# Etapa 3: ejecución
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
# ghostscript: optimiza el peso de las constancias firmadas en PDF.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ghostscript \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next

# Los videos subidos se guardan en public/uploads (montado como volumen).
RUN mkdir -p /app/public/uploads/videos /app/public/uploads/constancias \
    && chown -R node:node /app/public/uploads

USER node
EXPOSE 3000
CMD ["npm", "start"]
