# ── Stage 1: Build / install dependencies ────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

# Install OS deps needed by native modules (better-sqlite3, sharp, canvas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime image ────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Install Tesseract OCR engine + English language data
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libvips \
    && rm -rf /var/lib/apt/lists/*

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Create persistent directories
RUN mkdir -p /app/data /app/uploads /app/generated /app/templates

# Non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "app.js"]
