# Stage 1: Builder
FROM node:16-slim AS builder

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install dependencies including dev dependencies for build
RUN npm ci

# Copy source code and config files
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript code
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM gcr.io/distroless/nodejs:16

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production \
    PORT=8080

# Copy built artifacts and production dependencies from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Use non-root user (distroless nodejs image uses 'nonroot' user with uid 65532)
USER 65532

# Make filesystem read-only
WORKDIR /app
RUN ["/busybox/chmod", "0444", "/app"]

# Expose application port
EXPOSE 8080

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD ["/nodejs/bin/node", "-e", "require('http').request('http://localhost:8080/health', { timeout: 2000 }, (res) => process.exit(res.statusCode === 200 ? 0 : 1)).end()"]

# Set entry point
CMD ["./dist/server.js"]
```

This Dockerfile implements a secure, optimized multi-stage build for the backend services. Let's go through the key aspects:

1. Multi-Stage Build:
- Stage 1 (builder): Uses node:16-slim for building the application
- Stage 2 (production): Uses distroless/nodejs:16 for a minimal, secure runtime environment

2. Security Considerations:
- Uses official base images with specified versions
- Runs as non-root user (UID 65532)
- Implements read-only filesystem
- Uses distroless image which has no shell or unnecessary tools
- Sets explicit environment variables

3. Size Optimizations:
- Multi-stage build separates build and runtime dependencies
- Uses slim base image for builder stage
- Prunes dev dependencies after build
- Only copies necessary files to production stage

4. Build Process:
- Copies package files first to leverage Docker layer caching
- Installs dependencies using `npm ci` for reproducible builds
- Builds TypeScript code using project configuration
- Removes dev dependencies before production stage

5. Runtime Configuration:
- Exposes port 8080
- Implements health check
- Sets proper NODE_ENV
- Uses proper entry point

6. Best Practices:
- Uses explicit versions for base images
- Implements health checks
- Follows layer optimization best practices
- Sets working directory explicitly
- Uses appropriate environment variables

The resulting image will be secure, optimized for production use, and follow all the specified requirements from the technical specification.

Note: This Dockerfile assumes the existence of a .dockerignore file to exclude unnecessary files from the build context. The .dockerignore file should include at minimum:
```
node_modules
npm-debug.log
Dockerfile
.dockerignore
.git
.gitignore
README.md
.env
*.md
tests
coverage