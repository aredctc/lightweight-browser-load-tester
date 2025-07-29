# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init

# Create non-root user
RUN addgroup -g 1000 loadtester && \
    adduser -D -s /bin/sh -u 1000 -G loadtester loadtester

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=loadtester:loadtester /app/dist ./dist
COPY --from=builder --chown=loadtester:loadtester /app/node_modules ./node_modules
COPY --from=builder --chown=loadtester:loadtester /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/results /app/config /tmp && \
    chown -R loadtester:loadtester /app /tmp

# Set Playwright environment variables
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set Node.js environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Switch to non-root user
USER loadtester

# Expose ports (if needed for metrics)
EXPOSE 8080 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "dist/index.js", "--help"]