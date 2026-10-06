# syntax=docker/dockerfile:1

# ── Build: the SPA is static after this stage ────────────────────────────────
FROM node:24.21.0-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ── Runtime: unprivileged nginx serving dist/ ────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.30.5-alpine

# Only our own config and startup hook. The stock hooks that rewrite files
# under /etc/nginx are removed: the container runs with a read-only root fs.
USER root
RUN rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
          /docker-entrypoint.d/20-envsubst-on-templates.sh \
          /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=0755 docker/40-rdm-config.sh /docker-entrypoint.d/40-rdm-config.sh
COPY --from=build /src/dist /usr/share/nginx/html
USER 101

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
