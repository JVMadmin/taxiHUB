# Etapa 1: Compilación de la aplicación React SPA
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json yarn.lock* ./
RUN yarn install --ignore-engines --network-timeout 100000

COPY . .
ENV GENERATE_SOURCEMAP=false
ENV NODE_ENV=production
RUN yarn build

# Etapa 2: Servidor web Nginx liviano
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
