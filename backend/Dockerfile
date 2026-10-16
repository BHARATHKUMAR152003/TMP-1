# PrintPress backend — Node.js + Express REST API.
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies first so the layer caches across code changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Upload directory — mounted as a volume in production so uploads persist and
# can be served by the frontend's nginx.
RUN mkdir -p uploads && chmod +x docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
