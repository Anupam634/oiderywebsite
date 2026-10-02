# Storefront + admin (Next.js standalone). Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_SITE_URL=https://your-domain -t store-web .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/stitch/package.json packages/stitch/
RUN pnpm install --frozen-lockfile --filter @store/web...
COPY packages packages
COPY apps/web apps/web
# public settings are baked into the browser bundle at build time
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_INDEXABLE=0
ARG NEXT_PUBLIC_MEDIA_BASE=/
ARG NEXT_PUBLIC_IMAGE_HOSTS=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_INDEXABLE=$NEXT_PUBLIC_INDEXABLE NEXT_PUBLIC_MEDIA_BASE=$NEXT_PUBLIC_MEDIA_BASE NEXT_PUBLIC_IMAGE_HOSTS=$NEXT_PUBLIC_IMAGE_HOSTS NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @store/web build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
# resized photos are cached here (mount a volume to keep them across restarts)
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
