FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Prisma validate/generate during install. Railway does not inject
# runtime variables at build time.
ENV DATABASE_URL="file:./data/kanji.db"

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/kanji.db"
ENV UPLOAD_DIR=/app/data/uploads

RUN mkdir -p /app/data /app/data/uploads

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
