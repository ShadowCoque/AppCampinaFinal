# Servidor de afiliación de socios — Club La Campiña
#
# Imagen mínima: Node incorpora SQLite desde la versión 22.5 (`node:sqlite`),
# de modo que no hay dependencias nativas que compilar y la imagen final no
# necesita cadena de compilación.
#
# El contexto de construcción es la RAÍZ del proyecto, no la carpeta server/,
# porque el servidor comparte el dominio TypeScript con la aplicación móvil.
# Construir con:  docker compose -f server/docker-compose.yml build

# ---------- Etapa de compilación ----------
FROM node:24-alpine AS compilacion

WORKDIR /construccion

# Dependencias primero, para aprovechar la caché de capas.
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --no-audit --no-fund

# Código: el dominio compartido y el servidor.
COPY src/domain ./src/domain
COPY server/tsconfig.json ./server/
COPY server/src ./server/src

RUN cd server && npx tsc -p tsconfig.json

# Se descartan las dependencias de desarrollo para la imagen final.
RUN cd server && npm ci --omit=dev --no-audit --no-fund

# ---------- Imagen final ----------
FROM node:24-alpine

# Usuario sin privilegios: el contenedor nunca escribe como root en los
# volúmenes del Club.
RUN addgroup -S campina && adduser -S campina -G campina

WORKDIR /app

COPY --from=compilacion /construccion/server/node_modules ./node_modules
COPY --from=compilacion /construccion/server/dist ./dist
COPY --from=compilacion /construccion/server/package.json ./package.json
COPY web ./web

# El servidor resuelve la carpeta web como ../../../web desde
# dist/server/src/index.js, es decir /app/web.
RUN mkdir -p /datos /escaneos && chown -R campina:campina /app /datos

USER campina

ENV NODE_ENV=production \
    PUERTO=8080 \
    HOST=0.0.0.0 \
    DATOS_DIR=/datos \
    ESCANEOS_DIR=/escaneos \
    ESCANEOS_REVISAR_DIR=/escaneos/_REVISAR

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PUERTO||8080)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/src/index.js"]
