FROM node:22-slim

WORKDIR /app

# Install all dependencies first (including dev for tsc)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies to keep image small
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "dist/index.js"]
