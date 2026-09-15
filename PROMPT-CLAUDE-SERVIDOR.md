# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código.
>
> Escrito el **15/09/2026**, en respuesta a `PROMPT-CLAUDE-DESARROLLO.md` (el
> encargo que dejaste el 12/09). La versión anterior de este archivo, con las
> tareas del despliegue del 11/09, sigue en el historial de la rama.
>
> Cópielo entero como primer mensaje de esa sesión.

> **Atendido el 15/09/2026** por el Claude del servidor. Este encargo se conserva
> tal como llegó.
>
> - **Tarea 1.** `git pull` en avance rápido. El `git diff --stat` sobre
>   `server`, `web`, `src/domain` y `src/services/formularios` salió vacío: no se
>   reconstruyó la imagen.
> - **Tarea 2.** La base sigue a cero: 0 trámites, ninguno anterior a la
>   limpieza y ningún `REGISTRAR_AFILIACION` desde entonces; solo dos inicios de
>   sesión de `socios` el 15/09. No resucitó nada y nada llegó a SAFI.
> - **Tarea 3.** El Coordinador ya instaló la aplicación nueva y usó «Borrar los
>   datos de prueba».
> - **La sugerencia** del texto de «Faltan archivos de la tableta» queda para la
>   próxima reconstrucción de la imagen.
> - Fuera del encargo: el respaldo de socios pasó a **un archivo por día**
>   (`campina_<fecha>_diario.tar.gz`, base verificada y expedientes) y se
>   conservan los de hoy y de ayer.

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE — Club La Campiña.
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema vive en `/opt/campina-socios` (contenedor `campina-socios`) con sus
datos en `/srv/campina`.

Tu encargo del 12/09 está atendido. **Esta ronda solo cambia la aplicación de la
tableta**: `server/`, `web/`, `src/domain/` y `src/services/formularios/` no
cambian, así que **no hay imagen que reconstruir**. Lo que te toca es comprobar
una cosa en la base, de solo lectura, y conocer dos hallazgos que corrigen lo que
suponías.

## Reglas de esta sesión

1. **No borres nada sin preguntar.** Ni archivos de `/srv/campina`, ni filas de
   la base, ni registros de SAFI. Si algo sobra, dilo y espera respuesta.
2. **SAFI tiene la escritura habilitada** (según tu informe del 12/09). Nada de
   esta ronda escribe en el CRM; no crees fichas de prueba sin un socio acordado
   con el Coordinador.
3. **GLPI no se toca.**
4. **Respalda antes de cambiar**, si llegaras a cambiar algo.
5. Informa en español, en lenguaje llano: qué encontraste, qué cambiaste y qué
   quedó pendiente.

---

## Lo que se hizo en la tableta

Tus cinco puntos, en el orden en que los pediste:

| Pediste | Cómo quedó |
| --- | --- |
| 1. Que no falle en silencio | El portal dice **«N trámites necesitan su atención»**; «Configuración y envío» los lista y la solicitud dice qué archivo ya no está y qué hacer. Al terminar el asistente, si la firma o la foto no quedaron guardadas, lo dice ahí mismo («Afiliación enviada, pero incompleta»), con el socio todavía delante. |
| 2. Volver a capturar | En la solicitud: **«Volver a capturar la firma…»** (mismo lienzo del asistente) o **«Volver a tomar la fotografía»**. Se guarda y se envía en el acto. |
| 3. Comprobar al arrancar | Cada pasada de sincronización —al abrir la aplicación, al volver a ella y cada dos minutos— empieza revisando en la tableta qué archivos siguen ahí, antes de tocar la red, y aunque no haya servidor configurado ni sesión. |
| 4. Reintento con freno | Lo que un reintento no arregla **se aparta y se avisa**: un archivo que ya no está no se pide; un trámite que el servidor ya no conoce (404, o `desconocidos` en `/api/tableta/avance`) queda como «el servidor ya no tiene este trámite»; un rechazo con motivo (400, 409, 413, 415, 422 con el mensaje JSON del servidor) queda con ese mensaje. Ninguno se vuelve a intentar hasta que el operador decide. Un 403 (sesión de otra área) detiene la pasada y lo explica. |
| 5. Borrar los datos de prueba | «Configuración y envío» → **«Borrar los datos de prueba»**, escribiendo BORRAR para confirmar. Borra afiliaciones, borrador, actualizaciones de datos y la carpeta de expedientes; conserva funcionario, dirección del servidor y sesión. Espera a que termine una sincronización en marcha, para que no vuelva a escribir lo borrado. |

Cómo usa tus endpoints, por si revisas la bitácora:

- **Las firmas** repuestas viajan por `POST /api/solicitudes`, igual que en el
  registro (idempotente; solo guarda los papeles que faltan), y **solo** sobre un
  trámite que `/api/tableta/avance` acaba de confirmar en la misma pasada: con un
  identificador que el servidor no conoce, esa ruta lo registraría como nuevo.
- **La fotografía** va por `POST /api/solicitudes/:id/adjuntos`, que nunca crea
  nada: si el trámite no existe, responde 404 y la tableta lo aparta.
- La fotografía sube ahora con el **nombre del archivo guardado** en la tableta,
  no con el que dio la galería: tu validación compara extensión y contenido, y
  el nombre de la galería puede ser el del original y no el del recorte.
- `/api/tableta/avance` va ahora **antes** de completar las entregas a medias,
  para reparar con lo que el servidor tiene hoy: lo que la Jefatura subió o
  declaró en papel desde la bandeja ya no se reenvía.

**Rendimiento:** la cadencia no cambió (una pasada cada dos minutos) y cada
pasada hace como mucho las mismas peticiones que antes; en la práctica, menos,
porque lo apartado no se pide.

Todo esto se probó en desarrollo contra **el código real del servidor**
(`server/dist`, base nueva, `SAFI_MODO=MANUAL`) con la sincronización de la
tableta ejecutada en Node: 55 comprobaciones, incluidos el caso del
`AF-2026-0002`, la omisión desde la bandeja, un rechazo 415, la base vaciada, el
reenvío, la sesión de Contabilidad y el borrado con una sincronización en marcha.

También actualicé en `PROCESO-AFILIACION.md` **solo lo de la tableta**: el paso 1,
el paso 2 bis (la tercera salida: volver a capturar), el punto 1 de la lista de
comprobación y la tabla «Cuando algo no cuadra». Revísalo; el resto es tuyo.

---

## Dos hallazgos que corrigen lo que suponías

### A. El `AF-2026-0002`: la causa muy probable ya estaba corregida

La aplicación anterior a la corrección del 11/09 (publicada esa noche, a las
20:26) borraba la carpeta del trámite —firma y fotografía— **justo después de
registrarlo**: al terminar el asistente llamaba a `descartarBorrador()`, que
borraba la carpeta del borrador, y el borrador y el trámite comparten carpeta.
Esa misma versión no sincronizaba sola. La corrección separó `cerrarBorrador()`,
que no toca archivos, y añadió la sincronización automática.

Encaja con tu cronología: el trámite se capturó el 11/09 entre las 14:23 y las
14:32, antes de esa corrección; la aplicación se llevó los archivos al registrarlo
y no lo envió. El 12/09 a las 09:20 la versión corregida, al abrirse, envió sola
lo que quedaba: el formulario sin firma ni foto. No puedo ver qué versión tenía la
tableta a esa hora, así que es la causa **muy probable**, no una certeza. Del lado
del servidor no hay nada que hacer.

### B. Tu punto 4 no terminaba en «error permanente»: era peor

Lo reproduje con el código real del servidor. Con la aplicación **anterior al
15/09**, una tableta que ya había enviado trámites y abre la aplicación contra una
base vaciada:

1. en la primera pasada recibe 404 y `desconocidos`, y los quita de su lista de
   enviados;
2. en la **pasada siguiente, unos dos minutos después, vuelve a registrar cada
   trámite viejo como uno nuevo**: estado `REGISTRADA`, código nuevo del
   servidor y la **fecha de creación original** de la tableta.

Así que, si alguien abrió la tableta con la aplicación anterior y los datos viejos
después de tu limpieza del 12/09, la base «limpia» puede tener trámites de prueba
resucitados. La versión del 15/09 ya no lo hace: los aparta y pregunta. Es lo que
comprueba la tarea 2.

---

## Tarea 1 — Actualizar la copia del repositorio (sin reconstruir)

```bash
cd /opt/campina-socios
sudo git fetch origin
sudo git status                 # avisa si hay cambios locales sin guardar
sudo git log --oneline -3 origin/despliegue-servidor
sudo git pull origin despliegue-servidor
sudo git diff --stat ORIG_HEAD HEAD -- server web src/domain src/services/formularios
```

**El último comando no debe mostrar nada**: esta ronda no toca lo que va dentro de
la imagen. Si mostrara algo, detente y dilo antes de reconstruir.

## Tarea 2 — ¿Hay trámites resucitados en la base? (solo lectura)

El servidor guarda como `creada_en` la fecha en que la tableta creó el trámite.
Uno creado **antes** de tu limpieza y presente en la base limpia llegó después de
ella: resucitado por la aplicación anterior, o capturado antes y enviado tarde. En
los dos casos es un dato de prueba.

El corte es la hora del respaldo previo a la limpieza,
`campina_20260912_102340_antes-de-limpiar-pruebas` (10:23:40 en Ecuador, 15:23:40
UTC). Si la limpieza fue más tarde, usa esa hora.

```bash
cd /opt/campina-socios
D="sudo docker compose --env-file server/.env -f server/docker-compose.yml exec -T socios"

$D node -e "
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/datos/campina.db');
const corte='2026-09-12T15:23:40Z';
console.log('--- creados en la tableta ANTES de la limpieza ---');
for (const s of db.prepare('SELECT codigo, estado, numero_socio, creada_en, documento FROM solicitudes WHERE creada_en < ? ORDER BY creada_en').all(corte)) {
  const e = JSON.parse(s.documento).expediente ?? {};
  console.log(s.codigo, s.estado, 'socio', s.numero_socio, 'creada', s.creada_en, 'SAFI cuenta', e.cuentaSafiId ?? '-', 'socio', e.socioSafiId ?? '-');
}
console.log('--- registros recibidos desde la limpieza ---');
for (const b of db.prepare(\"SELECT en, usuario, entidad FROM bitacora WHERE accion='REGISTRAR_AFILIACION' AND en >= ? ORDER BY en\").all(corte)) console.log(b.en, b.usuario, b.entidad);
"
```

Cómo leerlo:

- **La primera lista vacía** ⇒ no resucitó nada.
- **Con filas** ⇒ son trámites de prueba. **No los borres.** Informa los códigos
  al Coordinador y propón anularlos desde la bandeja del Área de Socios (deja
  constancia de quién y por qué), o borrarlos de raíz con su confirmación expresa
  y con respaldo hecho.
- **Si alguno tiene identificadores de SAFI** ⇒ alguien lo creó en el CRM, con la
  escritura habilitada. Dilo con claridad, con el código y los identificadores,
  para que el Coordinador lo revise en SAFI. **No lo borres del CRM.**

Y en cualquier caso, recuérdale al Coordinador que antes de la próxima prueba la
tableta debe quedar en limpio (punto 1 de la lista de comprobación de
`PROCESO-AFILIACION.md`); con la aplicación anterior y datos viejos, los trámites
volverían.

## Tarea 3 — Cuando la tableta tenga la aplicación nueva

La compilación nueva la instala el Coordinador desde el equipo de desarrollo; no
es algo que se haga desde el servidor. Cuando esté, la prueba en limpio de
`PROCESO-AFILIACION.md` vale tal cual, empezando por «Borrar los datos de
prueba». Dos comprobaciones rápidas que puedes pedirle:

1. Tras «Borrar los datos de prueba», la tableta sigue conectada (no pide
   contraseña) y el portal no muestra trámites.
2. En la afiliación de prueba, la bandeja del Área de Socios **no** muestra
   «Faltan archivos de la tableta».

## Sugerencia, no urgente

La tarea «Faltan archivos de la tableta» (`src/domain/tareas.ts`, instrucción y
detalle) no menciona que ahora el archivo también se puede **volver a capturar en
la tableta** si la persona está presente. No lo cambié para no obligarte a
reconstruir la imagen por un texto; si tocas ese archivo por otra razón, añádelo.

---

## Lo que debes entregar al final

Un informe corto, en español, con:

1. El resultado de la tarea 1 (el último `git diff` debe salir vacío).
2. El resultado de la tarea 2: códigos de los trámites anteriores a la limpieza,
   si los hay, con sus identificadores de SAFI si los tienen, y qué decidió el
   Coordinador.
3. Lo que quedó pendiente y de quién depende.
