# Stage 1: Install dependencies
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

# Prisma 7 reads DIRECT_URL from prisma.config.ts.
# This placeholder is for client generation only; it is not a real DB connection.
ENV DIRECT_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder

RUN npm ci --no-audit --no-fund


# Stage 2: Build Next.js application
FROM node:22-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Next.js evaluates some server modules while collecting route/page data.
# The DB client currently validates DATABASE_URL at module initialization.
# Set a build-only placeholder; it is not copied into the final runtime image.
ENV DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder
ENV DIRECT_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder

# Public Firebase configuration
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

# Public Supabase configuration
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
ENV NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate && npm run build


# Stage 3: Run production application
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
