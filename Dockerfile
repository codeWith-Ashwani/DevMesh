# ----------------------------------------------------
# Stage 1: Dependency Installation
# ----------------------------------------------------
FROM node:22-alpine AS dependencies

WORKDIR /app

# Copy package manifests first for Docker layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# ----------------------------------------------------
# Stage 2: Production Runtime Image
# ----------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Set default production environment variables
ENV NODE_ENV=production
ENV PORT=7777

# Copy production dependencies from build stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy package metadata and application source
COPY package.json ./
COPY src/ ./src/

# Assign file ownership to the unprivileged node user
RUN chown -R node:node /app

# Run as non-root user for container security
USER node

# Expose default application port
EXPOSE 7777

# Zero-dependency native health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 7777) + '/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Production container entrypoint
CMD ["node", "src/app.js"]
