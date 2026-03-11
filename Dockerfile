FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar TODAS las dependencias (incluyendo dev para compilar)
RUN npm ci

# Copiar código fuente
COPY tsconfig.json ./
COPY src/ ./src/

# Compilar TypeScript
RUN npx tsc

# --- Etapa de Producción ---
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copiar solo el código compilado
COPY --from=builder /app/dist ./dist
COPY src/knowledge.txt ./dist/knowledge.txt

EXPOSE 3000

CMD ["node", "dist/index.js"]
