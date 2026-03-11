FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar dependencias
RUN npm ci --omit=dev

# Copiar código fuente
COPY tsconfig.json ./
COPY src/ ./src/

# Compilar TypeScript
RUN npx tsc

# Exponer puerto
EXPOSE 3000

# Iniciar aplicación
CMD ["node", "dist/index.js"]
