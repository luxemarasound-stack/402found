FROM node:20-slim
WORKDIR /app
COPY package*.json ./
COPY node_modules/ ./node_modules/
COPY src/ ./src/
EXPOSE 8080
CMD ["node", "src/server.js"]
