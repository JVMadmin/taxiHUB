FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3099

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src

# Credenciales de WhatsApp y contactos por sitio: volumen, nunca dentro de la imagen.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
USER node

EXPOSE 3099
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3099/health || exit 1

CMD ["node", "src/index.js"]
