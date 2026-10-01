# Store API: Node 22 + Python (pyembroidery for machine files). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t store-api .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @store/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @store/api generate \
 && pnpm --filter @store/api build \
 && pnpm --filter @store/api deploy --prod --legacy /out

FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages pyembroidery==1.5.1 \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0 PYTHON_BIN=python3
WORKDIR /app
COPY --from=build /out ./
RUN mkdir -p .data && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# apply new database migrations, then start (set RUN_MIGRATIONS=0 to skip, e.g. when a release step runs them)
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-1}\" = \"1\" ]; then node_modules/.bin/prisma migrate deploy; fi && exec node dist/server.js"]
