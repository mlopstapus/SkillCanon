FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN pnpm build

FROM node:24-slim AS migrator
WORKDIR /app
RUN corepack enable
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/shared/db ./src/shared/db
# drizzle.config.ts's schema globs include ./src/bcs/*/infrastructure/
# schema.ts, each of which imports `@/shared/db/columns`/`@/shared/db/
# schemas` (see tsconfig.json's path aliases) — copy the whole src/bcs
# tree rather than just the schema.ts files, since a Docker COPY glob
# matching files across multiple subdirectories flattens them into one
# destination dir, losing the per-bounded-context structure the schema
# glob itself needs to resolve.
COPY --from=build /app/src/bcs ./src/bcs
CMD ["pnpm", "db:migrate"]

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
