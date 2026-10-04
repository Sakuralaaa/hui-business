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
RUN mkdir -p /data/objects && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node","apps/api/dist/main.js"]
FROM nginx:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
