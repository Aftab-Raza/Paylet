FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --include=dev
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY tests ./tests
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run build \
    && test -s dist/server.js \
    && test -s dist/generated/prisma/client.js

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY scripts ./scripts
USER node
EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 CMD node -e "fetch('http://127.0.0.1:5000/api/health/db').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
