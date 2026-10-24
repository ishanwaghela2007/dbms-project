# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install build tools needed by native addons (canvas / tesseract headers)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 2: production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Tesseract runtime (used by paper/marks OCR)
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

# Non-root user
RUN addgroup -S erp && adduser -S erp -G erp

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY protos ./protos
COPY database ./database

USER erp

# SERVICE_NAME is injected at container runtime by Railway / docker-compose
# PORT is also injected by Railway (defaults to 4000 for gateway, gRPC ports for services)
ENV NODE_ENV=production

# The start command is controlled by the Railway start command / compose command
# override. Default falls back to the gateway for safety.
CMD ["node", "src/gateway/server.js"]
