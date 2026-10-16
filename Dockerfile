# Single-container PrintPress build: the React SPA is compiled and copied into
# the Express image, which then serves the UI, the API and /uploads on one port.
#
#   docker build -t printpress .
#   docker run -p 5000:5000 --env-file .env printpress

# ---------- Stage 1: build the SPA ----------
FROM node:20-alpine AS client

WORKDIR /client

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: API + static bundle ----------
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY --from=client /client/dist ./public

RUN mkdir -p uploads && chmod +x docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
