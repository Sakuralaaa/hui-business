FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm install --no-audit --no-fund && npm run db:generate && npm run build
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/catalog ./catalog
COPY --from=build /app/deploy ./deploy
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/LICENSE /app/THIRD_PARTY_NOTICES.md ./
COPY --from=build /app/third_party ./third_party
RUN mkdir -p /data/objects && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node","apps/api/dist/main.js"]
FROM nginx:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/licenses/hui-business/
EXPOSE 8080
FROM runtime AS app
USER root
# The deployed database is PostgreSQL 18: use the matching dump/restore tools.
RUN apt-get update && apt-get install -y --no-install-recommends curl nginx supervisor util-linux \
    && curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/keyrings/postgresql.asc \
    && echo 'deb [signed-by=/usr/share/keyrings/postgresql.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/web/dist /app/public
RUN chmod +x /app/deploy/compact/entrypoint.sh
ENV STORAGE_PATH=/data/objects BACKUP_PATH=/data/backups WORKER_HEARTBEAT_PATH=/tmp/hui/worker-ready.json
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/bin/sh", "/app/deploy/compact/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/app/deploy/compact/supervisord.conf"]
