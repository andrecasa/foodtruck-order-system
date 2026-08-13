FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

# Install all dependencies (including tsx for runtime)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/backend/ apps/backend/

EXPOSE 4000

WORKDIR /app/apps/backend

# Run directly with tsx (handles TypeScript + path aliases at runtime)
CMD ["npx", "tsx", "src/index.ts"]
