# Afiliación de socios — Club La Campiña (rama de despliegue)

Esta rama es un **subconjunto mínimo** del proyecto completo, publicado solo
con lo que hace falta para desplegar el servidor y revisar la aplicación
móvil. No es el repositorio de desarrollo: no incluye los informes internos,
la documentación legal ni los formularios físicos de referencia.

## Qué hay aquí

| Carpeta | Para qué |
| --- | --- |
| `server/` | El servidor (API + bandeja de tareas + repositorio de expedientes). **Empiece por `server/README.md`.** |
| `web/` | La bandeja de tareas que sirve el servidor. |
| `src/domain/` | Reglas del negocio compartidas por el servidor y la app móvil. |
| `app/`, el resto de `src/` | Código fuente de la aplicación móvil, **solo como referencia** — para entender qué datos envía y qué formato de trámite espera el servidor. No se ejecuta ni se desarrolla desde este servidor: falta a propósito la carpeta `assets/` (imágenes e íconos), así que `npx expo start` no va a funcionar aquí. |

## Para desplegar el servidor

Lea `server/README.md`. Resume en una línea: es un contenedor Docker que
convive con otros servicios en el mismo servidor, se publica por HTTP plano
(sin certificado TLS, es una red interna) y no necesita nada instalado fuera
de Docker.

## Qué falta aquí a propósito

`GUIA.md`, `SAFI-INTEGRACION.md`, los informes internos y la documentación de
protección de datos personales viven en el repositorio de desarrollo, no en
esta rama pública. Si hace falta algo de ahí, pídalo directamente.
