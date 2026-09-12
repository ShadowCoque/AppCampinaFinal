# Encargo para el Claude de desarrollo (aplicación móvil)

> Lo escribe el Claude que trabaja **en el servidor del Club**
> (`soporte.clublacampina.com.ec`, 192.168.2.185), el 12/09/2026. Cópielo como
> primer mensaje de la sesión de desarrollo, o léalo tal cual: describe lo que
> cambió en el servidor, lo que hay que arreglar en la tableta y lo que no debe
> tocarse.
>
> Antes de empezar: `git pull origin despliegue-servidor`. El dominio compartido
> (`src/domain`) cambió.

## 1. Estado del servidor a esta fecha

| Cosa | Estado |
|---|---|
| Imagen | reconstruida hoy, 405 MB, con Chromium para el PDF |
| Base de datos | **vaciada a cero**: 0 trámites, 0 archivos, 0 adjuntos, 0 incidencias, 0 bitácora, 0 sesiones. Solo quedan los tres usuarios con sus nombres reales |
| Carpetas | `/srv/campina/datos/expedientes` y `/srv/campina/escaneos` vacías (solo `_ARCHIVADOS` y `_REVISAR`) |
| SAFI | `SAFI_MODO=API` y **`SAFI_ESCRITURA=true`**. El diagnóstico pasa los ocho pasos; el usuario `integracion.socios` (19x41) puede crear en Cuentas, Socios y Documentos |
| Respaldo | diario a la 01:30 en `/home/joel/glpi_backups`, tres copias |

Codigos: el siguiente trámite será `AF-2026-0001` otra vez (el código se deriva
del máximo existente).

## 2. Lo que cambió en el dominio compartido (`src/domain`)

Todo es **aditivo y compatible**, pero conviene conocerlo porque la aplicación
consume estos tipos.

### `solicitud.ts`

```ts
// Nuevos campos opcionales de EstadoExpediente
adjuntosOmitidos?: OmisionAdjunto[];   // { rol, motivo, responsable, en }
escaneosOmitidos?: OmisionEscaneo[];   // { tipo, motivo, responsable, en }
```

`adjuntosFaltantes(solicitud)` **ya descuenta lo omitido**. Es la función que la
tableta usa para decidir si reintenta una entrega a medias
(`services/servidor.ts`), así que en cuanto la Jefatura declara «la firma consta
en el papel», la tableta deja de reintentar sola. No hace falta cambiar nada
para que eso funcione; solo saberlo.

### `tareas.ts`

- `MetaTarea.accion` y `MetaTarea.exigeObservacion` **ya no existen**. En su
  lugar:
  - `instruccion: string` — qué debe hacer quien recibe la tarea, en imperativo.
  - `salidas: [SalidaTarea, ...SalidaTarea[]]` — las formas de resolverla. El
    tipo es una tupla no vacía: **es imposible añadir un tipo de tarea sin
    declarar cómo se cierra**, y esa es la regla que queremos conservar.
- `Tarea` viaja ahora con `instruccion`, `salidas` y, cuando aplica,
  `pendientes: PiezaPendiente[]` (`{ clave, etiqueta, nombreArchivo? }`).
- Todas las tareas nacen por `completar()`, que las rellena con lo que declara
  su tipo.

Si alguna pantalla de la aplicación dibuja tareas, puede dibujar los botones
desde `salidas` en lugar de una cadena de `if` por tipo, que es lo que se hizo
en la bandeja web.

## 3. El fallo real que hay que arreglar en la tableta

**Lo que pasó** (trámite `AF-2026-0002`, ya borrado, pero el registro está en el
respaldo `campina_20260912_102340_antes-de-limpiar-pruebas`):

1. El 11/09 a las 14:23 se capturó la fotografía y a las 14:32 se cerró la
   afiliación con su firma (el asistente no deja terminar sin firma:
   `validarConsentimiento` lo exige).
2. El envío no salió ese día.
3. El 12/09 a las 09:20, al abrirse la aplicación, la sincronización envió el
   formulario **sin la firma y sin la fotografía**: `adjuntos` quedó vacía en el
   servidor y el trámite apareció con la tarea «Faltan archivos de la tableta».

**Diagnóstico:** `firmaBase64()` y `subirFotografia()` devuelven `null` cuando
`leerBase64()` no encuentra el archivo, y la sincronización sigue adelante sin
decir nada. El formulario llega; las imágenes, no. Las rutas viven en
`Paths.document/expedientes/<solicitudId>/`, que debería sobrevivir a un
reinicio — hay que averiguar qué se las llevó (¿reinstalación? ¿un *dev build*
nuevo? ¿un borrado de datos?) y, sobre todo, dejar de perderlas en silencio.

**Lo que hace falta, por orden de importancia:**

1. **Que no falle en silencio.** Si al sincronizar un archivo del expediente ya
   no está en el dispositivo, decirlo: en la pantalla del trámite y en
   «Configuración y envío», con el nombre de lo que falta y qué hacer («la
   Jefatura puede subirlo desde la bandeja»). Hoy el operador cree que envió
   todo.
2. **Poder volver a capturar** la firma o la fotografía de un trámite ya
   enviado, y subirla como adjunto. El endpoint ya existe y acepta las dos
   cosas:
   `POST /api/solicitudes/:id/adjuntos` (multipart, campos `rol` y `archivo`;
   roles `FIRMA_SOLICITANTE`, `FIRMA_GARANTE_1`, `FIRMA_GARANTE_2`,
   `FOTO_CARNET`). Es la reparación limpia, y hoy solo la puede hacer la
   Jefatura desde la bandeja.
3. **Comprobar al arrancar** que los archivos referenciados por los trámites
   locales existen, y marcar los que no. Vale más un aviso el mismo día que
   descubrirlo el día de la aprobación.
4. **Reintento con freno.** Si la subida de un adjunto responde 404 (el trámite
   no existe en el servidor) o el archivo local no está, no volver a intentarlo
   en cada ciclo: marcar el trámite y dejar de insistir hasta que el operador
   actúe. Esto importa ahora mismo: **la base del servidor se vació**, así que
   una tableta que conserve los trámites viejos pedirá adjuntos de trámites
   inexistentes y la sincronización quedará en error permanente.
5. **«Borrar los datos de prueba»** en «Configuración y envío»: borrar los
   trámites locales y su carpeta de expedientes, con confirmación escrita. Para
   montar un ambiente limpio hoy hay que borrar los datos de la aplicación desde
   los ajustes de Android, que también se lleva la dirección del servidor y la
   sesión.

**Rendimiento:** no cambie la cadencia. La sincronización actual (un envío por
trámite, reparación aparte) responde en milisegundos contra este servidor y la
bandeja se recarga cada minuto con una sola consulta. Lo que se pide es que
*avise*, no que *insista más*.

## 4. Endpoints nuevos del servidor (ya desplegados)

Todos exigen sesión del área **SOCIOS**.

| Método y ruta | Para qué |
|---|---|
| `POST /api/solicitudes/:id/adjuntos/:rol/omitir` | Declarar que una firma o la foto no llegarán. Cuerpo: `{ motivo }` (≥10 caracteres) |
| `POST /api/solicitudes/:id/escaneos/:tipo` | Subir un escaneo desde el navegador (multipart, campo `archivo`). Exige que el trámite ya tenga número de socio |
| `POST /api/solicitudes/:id/escaneos/:tipo/omitir` | Declarar que un documento no aplica. Cuerpo: `{ motivo }` |
| `POST /api/escaneos/incidencias/:archivo/apartar` | Mover un archivo suelto a `_REVISAR/` y cerrar su tarea |
| `POST /api/escaneos/incidencias/:archivo/asignar` | Archivar a mano un escaneo. Cuerpo: `{ solicitudId, tipoDocumento }` |

`GET /api/bandeja` incluye ahora `catalogoDocumentos` (`{ tipo, nombre }[]`) para
el área de Socios.

Corregido también en `web/bandeja.js`: el ayudante `api()` fijaba
`Content-Type: application/json` en toda petición con cuerpo, lo que rompía
cualquier envío `multipart/form-data`. Ahora solo lo fija cuando el cuerpo es una
cadena. Si la aplicación tuviera un ayudante equivalente, revíselo.

## 5. Lo que no se toca desde desarrollo

- `server/.env` del servidor (secretos y credenciales del CRM). No está en el
  repositorio y no debe estarlo.
- El despliegue: la imagen la reconstruye el Claude del servidor.
- SAFI: está en producción del Club y con **escritura habilitada**. Nada de
  pruebas contra el CRM desde desarrollo.
- `PROMPT-CLAUDE-SERVIDOR.md` y `PROCESO-AFILIACION.md` describen el lado del
  servidor; si un cambio de la aplicación los desactualiza, dígalo en el commit.

## 6. Cómo coordinamos

La rama es `despliegue-servidor` y la usamos los dos. El Claude del servidor
sube los cambios de `server/`, `web/` y `src/domain` cuando ajusta el
despliegue; desarrollo sube `app/`, `src/` y el dominio cuando cambia el
formulario. Antes de trabajar, `git pull`; si el dominio cambió, mire este
archivo y `git log --oneline -5`.
