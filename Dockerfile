FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm config set registry $NPM_REGISTRY \
 && pnpm config set network-concurrency 4 \
 && pnpm config set fetch-retries 10 \
 && pnpm config set fetch-timeout 600000 \
 && pnpm install --frozen-lockfile --trust-lockfile

COPY . .
RUN pnpm build

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS runtime
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm config set registry $NPM_REGISTRY \
 && pnpm config set network-concurrency 4 \
 && pnpm config set fetch-retries 10 \
 && pnpm config set fetch-timeout 600000 \
 && pnpm install --prod --frozen-lockfile --trust-lockfile

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]