# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código.
>
> Escrito el **16/09/2026 por la noche**, después de que el Coordinador probara
> la compilación en la tableta. La versión anterior de este archivo sigue en el
> historial de la rama.
>
> Cópielo entero como primer mensaje de esa sesión.

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE — Club La Campiña.
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema vive en `/opt/campina-socios` (contenedor `campina-socios`) con sus
datos en `/srv/campina`.

**Esta ronda sí toca `server/`, y hay que reconstruir la imagen.** Son dos
fallos que encontró el Coordinador usando la tableta, y los dos se arreglan a
medias en cada lado, así que esta vez escribí yo también la parte del servidor:
sin ella la tableta no funciona, y separarlo en dos rondas dejaba «Mi firma»
inservible mientras tanto. **Revísalo**: son dos rutas, están abajo con su
porqué, y las probé contra tu propio código compilado.

## Reglas de esta sesión

1. **No borres nada sin preguntar.** Ni archivos de `/srv/campina`, ni filas de
   la base, ni registros de SAFI.
2. **SAFI tiene la escritura habilitada** y es el CRM real del Club. Nada de
   esta ronda escribe en él.
3. **GLPI no se toca.**
4. **Respalda antes de reconstruir.**
5. Informa en español, en lenguaje llano.

---

## Fallo 1 — «Mi firma» no llegaba nunca: la tableta no puede enviar multipart

**Lo que pasó.** El Coordinador entró en «Mi firma» con los tres usuarios y
ninguno pudo cargar su firma: *«No se pudo cargar la firma. No se pudo contactar
al servidor. Verifique la conexión»*. Pero la conexión estaba: con esa misma
sesión inició sesión, sincronizó y la firma del solicitante llegó bien y salió
impresa en su formulario.

**La causa.** Ese mensaje es el que la tableta da cuando `fetch` **rechaza sin
respuesta**. Y en tus registros no consta ninguna petición a `/api/mi-firma`:
falla en el dispositivo, antes de salir a la red. Lo que distingue a esa
petición de todas las que sí funcionan es la **forma**: era la única que enviaba
`multipart/form-data`.

Es **exactamente** el síntoma que documentaste de la fotografía tipo carnet el
15/09 —«decía no poder conectarse solo al enviar la fotografía; en los registros
no consta ninguna petición»—, que también iba por multipart. Con dos casos
independientes y el mismo cuadro, la conclusión es que **esta aplicación no
consigue enviar `multipart/form-data`**, sea cual sea el archivo. Las firmas del
solicitante y de los garantes nunca fallaron porque viajan como **base64 dentro
del JSON** de `POST /api/solicitudes`.

**La corrección.** Que la firma del funcionario viaje por donde ya se sabe que
funciona:

- **Tableta:** `guardarMiFirma` manda `{ firma }` con el PNG en base64. Se acabó
  el archivo temporal (`firmaTemporal`, retirado).
- **Servidor** (`server/src/http/api.ts`): `POST /api/mi-firma` acepta ahora las
  dos formas. Si la petición es multipart, se comporta igual que antes; si no,
  lee `body.firma`, la decodifica y **comprueba la cabecera del contenido** con
  `validarContenido`, el mismo lector que usa el expediente, de modo que sigue
  siendo imposible guardar como firma algo que no es una imagen. El límite de
  2 MB se aplica antes de decodificar y después.

Dejé anotado en `docs/RETIRADO-fotografia-carnet.md` que el misterio de la
fotografía está resuelto y que, si algún día vuelve con el control de accesos,
debe viajar igual: base64 en el cuerpo, nunca como parte de un formulario.

## Fallo 2 — Lo que se borra en la tableta seguía vivo en la bandeja

**Lo que pasó.** El Coordinador usó «Borrar los datos de prueba» (con su
BORRAR), la tableta quedó limpia… y la Jefatura siguió viendo en su bandeja los
trámites de prueba, sin forma de quitarlos.

Era así por diseño —«no toca el servidor»— y estaba mal: para montar un ambiente
limpio hace falta que las dos partes queden limpias.

**La corrección.**

- **Servidor** (`server/src/http/api.ts`, `db/solicitudes.ts`, `db/adjuntos.ts`):
  ruta nueva **`DELETE /api/solicitudes/:id`**, área SOCIOS. Borra la fila, sus
  adjuntos y su carpeta de `/datos/tramites/<id>/`; con el trámite desaparecen
  sus tareas, así que sale de la bandeja. Deja constancia en la bitácora
  (`BORRAR_AFILIACION`, con código, nombre y cédula).

  **Lo que no borra**, con 409 y su motivo (`motivoParaNoBorrar`): un trámite
  con número de socio, con `cuentaSafiId`/`socioSafiId`, ya aprobado, o con
  documentos archivados en el expediente. Eso ya no es un dato de prueba sino un
  socio del Club, y su salida sigue siendo la **anulación** desde la bandeja,
  que deja constancia de quién y por qué. La ruta no toca SAFI en ningún caso.

- **Tableta:** «Borrar los datos de prueba» pide primero al servidor que borre
  lo que ya le había llegado, y luego limpia la tableta. Al final dice cuántos
  se borraron allá, **enumera por código los que el servidor conservó** con su
  motivo, y avisa si no pudo ni preguntar (sin red, sin sesión, o un servidor
  anterior a esta ruta). Lo mismo hace «Eliminar» en una solicitud concreta.
  Nunca borra en silencio de un lado creyendo que borró de los dos.

## Lo que probé, y con qué

El banco de siempre —código real de la tableta ejecutado en Node contra
`server/dist` recién compilado, base nueva, `SAFI_MODO=MANUAL`, con
`expo-file-system` y `AsyncStorage` simulados—: **39 comprobaciones, todas en
verde**. Las de esta ronda:

- La firma del funcionario **sube y el servidor la recuerda**, con `socios` y
  con `contabilidad`. (Con el código anterior, esta prueba pasaba por multipart
  y también salía verde: Node sí sabe enviar multipart. Lo que no sabe es la
  tableta, y por eso la prueba no lo detectó. Anotado para no repetirlo: lo que
  la tableta hace distinto del banco de pruebas hay que mirarlo a mano.)
- Un trámite de prueba entra en la bandeja, se borra desde la tableta y
  **desaparece de la bandeja**; el servidor responde 404 y la tableta tampoco lo
  conserva.
- Un trámite con número de socio: el servidor lo **conserva**, responde con el
  motivo («El trámite ya tiene número de socio (2924).») y la tableta lo dice.
- «Borrar los datos de prueba» con cinco trámites, uno de ellos ya con número:
  vacía la tableta, borra cuatro en el servidor, deja el quinto y lo enumera, y
  la bandeja no conserva ninguno de los borrados.

---

## Tarea 1 — Actualizar y reconstruir

```bash
cd /opt/campina-socios
sudo git fetch origin
sudo git status
sudo git log --oneline -3 origin/despliegue-servidor
sudo git pull origin despliegue-servidor
sudo git diff --stat ORIG_HEAD HEAD -- server web src/domain src/services/formularios
```

Esta vez el diff muestra `server/src/http/api.ts`, `server/src/db/solicitudes.ts`,
`server/src/db/adjuntos.ts` y `server/README.md`. **`src/domain/` y
`src/services/formularios/` no cambian.** Respalda, reconstruye la imagen y
levanta el contenedor como de costumbre.

**Antes de reconstruir, léete las dos rutas.** Si algo no te convence —el
criterio de `motivoParaNoBorrar`, o que la firma en base64 entre por la misma
ruta que el adjunto—, dilo y lo cambiamos: prefiero una ronda más que una ruta
de borrado que no te parezca segura.

## Tarea 2 — Comprobar con la tableta

Cuando el Coordinador instale la compilación nueva:

1. **«Mi firma»** con los tres usuarios. Debe decir «Firma cargada» y quedar
   `/datos/firmas` con los tres archivos y `firma_en` en los tres usuarios.
   Recuerda cerrar la sesión prestada y volver a la de `socios` al terminar.
2. Una afiliación de prueba → **«Borrar los datos de prueba»** en la tableta →
   la bandeja de Socios debe quedar **sin** ese trámite, y en la bitácora debe
   constar su `BORRAR_AFILIACION`.
3. La primera afiliación que recorra las tres áreas: el reverso del formulario
   final con **las tres constancias firmadas**.

## Lo que sigue pendiente y no es de esta ronda

- La lista formal de documentos por tipo de socio.
- `CORRESPONSAL A` en la lista `cf_917` de SAFI.
- La cuenta de Samba de la Jefatura de Socios.
- `POST /api/solicitudes/:id/adjuntos` (multipart) sigue ahí y está bien para la
  bandeja, que es un navegador y sí sabe enviarlo. **La tableta ya no lo usa ni
  puede usarlo**: si alguna vez hace falta que suba otro archivo, que sea base64
  en el cuerpo.

## Lo que debes entregar al final

Un informe corto, en español, con:

1. Si las dos rutas te parecen bien y qué cambiarías.
2. El resultado de la reconstrucción.
3. Las tres comprobaciones de la tarea 2 cuando la tableta esté al día.
4. Lo que quedó pendiente y de quién depende.
