# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npm run prisma:generate

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV PORT=4040

WORKDIR /app

RUN addgroup -S timesync && adduser -S timesync -G timesync

COPY --from=builder --chown=timesync:timesync /app/package*.json ./
COPY --from=builder --chown=timesync:timesync /app/node_modules ./node_modules
COPY --from=builder --chown=timesync:timesync /app/dist ./dist
COPY --from=builder --chown=timesync:timesync /app/prisma ./prisma
COPY --from=builder --chown=timesync:timesync /app/prisma.config.ts ./prisma.config.ts

USER timesync

EXPOSE 4040

CMD ["node", "dist/apps/api-gateway/apps/api-gateway/src/main.js"]
