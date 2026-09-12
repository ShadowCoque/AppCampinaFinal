# Servidor de afiliación de socios — Club La Campiña
#
# Imagen mínima: Node incorpora SQLite desde la versión 22.5 (`node:sqlite`),
# de modo que no hay dependencias nativas que compilar.
#
# La imagen final sí lleva Chromium: es con lo que el servidor imprime el
# formulario final del trámite —el que se archiva en el expediente y se publica
# en SAFI— a partir del mismo HTML que compone la tableta. Sin él el sistema
# funciona igual, pero ese PDF habría que guardarlo a mano desde el navegador.
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

# Código: el dominio compartido, el generador del formulario y el servidor.
COPY src/domain ./src/domain
COPY src/services/formularios ./src/services/formularios
COPY server/tsconfig.json ./server/
COPY server/src ./server/src

RUN cd server && npx tsc -p tsconfig.json

# Se descartan las dependencias de desarrollo para la imagen final.
RUN cd server && npm ci --omit=dev --no-audit --no-fund

# ---------- Imagen final ----------
FROM node:24-alpine

# Chromium para imprimir el PDF, y las tipografías sin las que el documento
# saldría con las letras sustituidas. `ttf-liberation` incluye la equivalente
# métrica de Arial, que es la del formulario del Club. La ruta del ejecutable
# la detecta el propio servidor (`/usr/bin/chromium-browser` o
# `/usr/bin/chromium`); `PDF_NAVEGADOR` solo hace falta para forzar otra.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-liberation \
      font-noto

# Usuario sin privilegios, con el MISMO identificador que la documentación de
# despliegue usa en el anfitrión (1500): los volúmenes de /srv/campina son de
# 1500:1500, y con un identificador distinto el contenedor no podría escribir
# en ellos ni retirar los escaneos ya archivados.
RUN addgroup -S -g 1500 campina && adduser -S -u 1500 -G campina -h /home/campina campina

WORKDIR /app

COPY --from=compilacion /construccion/server/node_modules ./node_modules
COPY --from=compilacion /construccion/server/dist ./dist
COPY --from=compilacion /construccion/server/package.json ./package.json
COPY web ./web

# El servidor resuelve la carpeta web como ../../../web desde
# dist/server/src/index.js, es decir /app/web.
RUN mkdir -p /datos /escaneos && chown -R campina:campina /app /datos /home/campina

USER campina

ENV NODE_ENV=production \
    PUERTO=8080 \
    HOST=0.0.0.0 \
    DATOS_DIR=/datos \
    ESCANEOS_DIR=/escaneos \
    ESCANEOS_REVISAR_DIR=/escaneos/_REVISAR \
    ESCANEOS_ARCHIVADOS_DIR=/escaneos/_ARCHIVADOS \
    HOME=/home/campina

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PUERTO||8080)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/src/index.js"]
