# Afiliación de socios — Club La Campiña (rama de despliegue)

Esta rama es un **subconjunto mínimo** del proyecto completo, publicado solo
con lo que hace falta para desplegar el servidor y revisar la aplicación
móvil. No es el repositorio de desarrollo: no incluye los informes internos,
la documentación legal ni los formularios físicos de referencia.

## Qué hay aquí

| Carpeta | Para qué |
| --- | --- |
| `PROMPT-CLAUDE-SERVIDOR.md` | **Empiece por aquí.** Las tareas que le tocan a este servidor, en orden, con los comandos exactos y las precauciones. |
| `server/` | El servidor: API, bandeja de tareas, repositorio de expedientes, vigilante de escaneos y generación del formulario en PDF. El detalle técnico está en `server/README.md`. |
| `web/` | La bandeja de tareas que sirve el servidor, con el logotipo y los colores del Club. |
| `src/domain/` | Reglas del negocio compartidas por el servidor y la app móvil. |
| `src/services/formularios/` | El formulario del Club en HTML, compartido: la tableta lo imprime y el servidor lo convierte a PDF. |
| `app/`, el resto de `src/` | Código fuente de la aplicación móvil, **solo como referencia** — para entender qué datos envía y qué formato de trámite espera el servidor. No se ejecuta ni se desarrolla desde este servidor: falta a propósito la carpeta `assets/` (imágenes e íconos), así que `npx expo start` no va a funcionar aquí. |

## Para desplegar el servidor

Lea **`PROMPT-CLAUDE-SERVIDOR.md`**: dice qué hacer, en qué orden, y qué no se
debe tocar. Resume en una línea: es un contenedor Docker que convive con otros
servicios en el mismo servidor, se publica por HTTP plano (sin certificado
TLS, es una red interna) y no necesita nada instalado fuera de Docker.

Tres cosas cambiaron respecto de la versión anterior y **hay que atenderlas al
actualizar**:

- El contenedor trae ahora **Chromium**, para generar el formulario definitivo
  en PDF al aprobar. Su límite de memoria subió de 512 MB a **1 GB**.
- Hace falta la carpeta **`/srv/campina/escaneos/_ARCHIVADOS`**, con dueño
  `1500:1500`: es donde el vigilante deja los documentos ya procesados. Antes
  los borraba; ahora no borra nada.
- La escritura en SAFI viene **apagada** (`SAFI_ESCRITURA=false`). Se enciende
  solo con autorización expresa, y es la última tarea del prompt.

## Qué falta aquí a propósito

`GUIA.md`, `SAFI-INTEGRACION.md`, los informes internos y la documentación de
protección de datos personales viven en el repositorio de desarrollo, no en
esta rama pública. Si hace falta algo de ahí, pídalo directamente.
