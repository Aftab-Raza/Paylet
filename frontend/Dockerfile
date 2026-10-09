FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY index.html ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY eslint.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build && test -s dist/index.html

FROM nginx:1.29-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1

