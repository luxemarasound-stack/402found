FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --production
COPY src/ src/
EXPOSE 8080
ENV PORT=8080
CMD ["node", "src/server.js"]
