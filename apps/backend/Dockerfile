FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/backend/ apps/backend/

# Build shared package first, then backend
RUN pnpm --filter @order-system/shared build 2>/dev/null || true
RUN pnpm --filter @order-system/backend build

# --- Production stage ---
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
COPY --from=builder /app/apps/backend/dist apps/backend/dist

# Copy migrations and seed from builder (already present in full backend copy)
COPY --from=builder /app/apps/backend/migrations* apps/backend/
COPY --from=builder /app/apps/backend/seed* apps/backend/

EXPOSE 4000

WORKDIR /app/apps/backend

CMD ["node", "dist/index.js"]
