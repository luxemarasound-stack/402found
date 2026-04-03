FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY node_modules/ ./node_modules/
COPY tsconfig.json ./
COPY src/ ./src/
RUN node node_modules/typescript/bin/tsc

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY node_modules/ ./node_modules/
COPY --from=builder /app/dist ./dist
COPY .well-known ./.well-known
RUN mkdir -p /tmp/data
EXPOSE 3000
ENV DB_PATH=/tmp/data/registry.db
CMD ["node", "dist/index.js"]
