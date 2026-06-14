# Dev image for local Cloudflare Workers + D1 validation via wrangler dev.
# Debian-based (not alpine): wrangler/miniflare pull in better-sqlite3, which
# needs prebuilt glibc binaries for D1 --local support.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 8787

CMD ["sh", "-c", "npm run migrate && npm run dev -- --ip 0.0.0.0 --port 8787"]
