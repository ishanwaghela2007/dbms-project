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
COPY scripts ./scripts

RUN mkdir -p /app/uploads && chown -R erp:erp /app

USER erp

# SERVICE_NAME can be passed to run a single service (e.g., SERVICE_NAME=auth)
# If omitted or "all", scripts/start-all.js runs the all-in-one stack
ENV NODE_ENV=production

CMD ["node", "scripts/start-all.js"]
