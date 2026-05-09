FROM node:22-slim

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
