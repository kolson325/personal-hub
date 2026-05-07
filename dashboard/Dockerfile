FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Required so Next.js prerender that touches Prisma can initialize during image build.
ENV DATABASE_URL="file:/data/app.db"
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Used by the in-app redeploy runner (worker) to `git pull` and run `docker compose`
# against the host Docker daemon via the mounted `/var/run/docker.sock`.
# Note:
# - `docker-cli-compose` provides the `docker compose` plugin on Alpine.
# - `docker-cli-buildx` avoids Compose "Bake" warnings and enables modern builds when needed.
RUN apk add --no-cache git docker-cli docker-cli-compose docker-cli-buildx

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/worker ./worker

# SQLite DB lives on a mounted volume; Prisma expects absolute file URLs.
ENV DATABASE_URL="file:/data/app.db"
RUN mkdir -p /data

EXPOSE 3000
CMD ["npm","run","start"]
