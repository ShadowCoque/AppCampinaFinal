# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código, y ya está hecha y probada.
>
> Cópielo entero como primer mensaje de esa sesión.

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE — Club La Campiña.
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema que despliegas vive en `/opt/campina-socios` (contenedor Docker
`campina-socios`) con sus datos en `/srv/campina`.

El Claude de desarrollo acaba de publicar una versión nueva en la rama
`despliegue-servidor` del repositorio. **Corrige de raíz** varios problemas que
el Coordinador de TICs encontró probando el sistema, y cambia cosas del
anfitrión que solo tú puedes tocar.

## Reglas de esta sesión

1. **No borres nada sin preguntar.** Ni archivos de `/srv/campina`, ni filas de
   la base, ni registros de SAFI. Si algo sobra, dilo y espera respuesta.
2. **No escribas en el CRM de SAFI** hasta que el Coordinador lo autorice
   expresamente. SAFI es el sistema en producción del Club: ahí están los socios
   reales. Todas las comprobaciones que se piden abajo son de solo lectura.
3. **GLPI no se toca.** Ni sus contenedores, ni sus volúmenes, ni su nginx si
   lo tuviera.
4. **Respalda antes de cambiar.** El primer paso es un respaldo.
5. Informa en español, en lenguaje llano, diciendo qué encontraste, qué
   cambiaste y qué quedó pendiente.

---

## Tarea 1 — Respaldo previo (antes de cualquier otra cosa)

```bash
sudo tar czf /respaldos/campina-antes-de-actualizar-$(date +%F-%H%M).tar.gz -C /srv/campina datos escaneos
docker image ls | grep campina    # anota la etiqueta de la imagen actual, por si hay que volver
```

Si `/respaldos` no existe, usa la ruta donde se guarden los respaldos de GLPI y
dilo en tu informe.

## Tarea 2 — Averiguar qué pasó con los escaneos que «desaparecieron»

El Coordinador dejó documentos correctamente nombrados en la carpeta compartida
de Samba y **desaparecieron sin llegar a `_REVISAR`**. La explicación
más probable es que la versión anterior del vigilante, después de copiarlos al
repositorio, **borraba el original** de la carpeta compartida. Hay que
confirmarlo con datos, no suponerlo:

```bash
# ¿Están en el repositorio de expedientes?
sudo ls -R /srv/campina/datos/expedientes

# ¿Qué dice la base? (el contenedor tiene Node; no hace falta instalar sqlite3)
D="docker compose --env-file server/.env -f server/docker-compose.yml exec -T socios"
cd /opt/campina-socios

$D node -e "
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/datos/campina.db');
console.log('--- archivos archivados ---');
for (const f of db.prepare('SELECT numero_socio, ordinal_dependiente, nombre_archivo, origen, solicitud_id, safi_estado, registrado_en FROM archivos ORDER BY registrado_en').all()) console.log(f);
console.log('--- incidencias ---');
for (const i of db.prepare('SELECT archivo, motivo, detalle, resuelta_en FROM incidencias').all()) console.log(i);
"
```

Con eso responde, en tu informe, a estas preguntas:

- ¿Cada documento que el Coordinador dejó está hoy en
  `/srv/campina/datos/expedientes/<número> <nombre>/`?
- ¿A qué trámite se asoció cada uno (`solicitud_id`)? Si es `null`, se archivó
  sin trámite: es el caso que la versión nueva ya no permite.
- ¿Alguno se publicó en SAFI? (columna `safi_estado`; ver también la tarea 3).

**No borres esos archivos.** Si alguno quedó archivado bajo un número de socio
que no corresponde a ningún trámite, propón al Coordinador devolverlo a la
carpeta compartida (`cp`, no `mv`) para que la versión nueva lo procese bien, y
espera su respuesta.

## Tarea 3 — Comprobar que SAFI no fue modificado

El Coordinador necesita saber con certeza si sus pruebas escribieron algo en el
CRM. Comprueba **sin escribir nada**:

```bash
cd /opt/campina-socios
grep -E "^SAFI_" server/.env    # modo y si hay credenciales (no copies la clave a tu informe)

$D node -e "
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/datos/campina.db');
console.log('--- bitácora relacionada con SAFI ---');
for (const b of db.prepare(\"SELECT en, usuario, area, accion, entidad, detalle FROM bitacora WHERE accion LIKE '%SAFI%' OR accion='PUBLICAR_SAFI' ORDER BY en\").all()) console.log(b);
console.log('--- documentos marcados como cargados en SAFI ---');
for (const a of db.prepare(\"SELECT nombre_archivo, safi_estado, safi_mensaje FROM archivos WHERE safi_estado='CARGADO'\").all()) console.log(a);
console.log('--- trámites con identificadores de SAFI ---');
for (const s of db.prepare('SELECT codigo, estado, numero_socio, documento FROM solicitudes').all()) {
  const d = JSON.parse(s.documento);
  if (d.expediente?.cuentaSafiId || d.expediente?.socioSafiId)
    console.log(s.codigo, s.estado, 'cuenta', d.expediente.cuentaSafiId, 'socio', d.expediente.socioSafiId);
}
"
```

Interpretación:

- `SAFI_MODO=MANUAL` ⇒ el sistema **nunca** pudo escribir en el CRM.
- Sin filas `SAFI_ALTA_CREADA` ni `PUBLICAR_SAFI` en la bitácora ⇒ no se creó
  nada desde este sistema.
- `safi_estado='CARGADO'` con mensaje de carga manual ⇒ lo subió una persona,
  no el sistema.

Si el modo fuera `API` o `HTTP` y aparecieran altas o publicaciones, dilo con
claridad, con fecha y con el identificador que devolvió el CRM, para que el
Coordinador pueda revisarlas en SAFI. **No las borres del CRM.**

Como comprobación adicional de solo lectura, una vez desplegada la versión
nueva, entra a la bandeja como el usuario del Área de Socios y usa
**Cómo escanear → Comprobar la conexión**: dice si la API responde, si el
usuario puede leer los tres módulos y si la escritura está deshabilitada.

## Tarea 4 — Desplegar la versión nueva

```bash
cd /opt/campina-socios
sudo git fetch origin
sudo git status                 # avisa si hay cambios locales sin guardar
sudo git log --oneline -3 origin/despliegue-servidor
sudo git pull origin despliegue-servidor
```

Novedades que afectan al despliegue (todas documentadas en `server/README.md`):

- **El contenedor ahora lleva Chromium**: el servidor imprime el formulario
  final del trámite en PDF y lo archiva en el expediente. La imagen crece unos
  300 MB y el límite de memoria del servicio sube de 512 MB a 1 GB (en reposo
  ocupa ~80 MB).
- **El usuario del contenedor pasa a UID/GID 1500**, el mismo que documenta el
  README para `/srv/campina`. Comprueba que los volúmenes sean de `1500:1500`.
- **Nuevas variables en `server/.env`** (ver `server/.env.example`):
  `HORAS_SESION_TABLETA=720`, `SAFI_ESCRITURA=false` y `SAFI_CLAVE_WEB=` (vacía).
- **Nueva carpeta `_ARCHIVADOS`** dentro de la carpeta compartida de escaneos.
- La base migra sola al esquema 3 al arrancar (añade columnas y una tabla). El
  respaldo de la tarea 1 es la red por si algo saliera mal.

```bash
sudo mkdir -p /srv/campina/escaneos/_ARCHIVADOS /srv/campina/escaneos/_REVISAR
sudo chown -R 1500:1500 /srv/campina
sudo chmod 2770 /srv/campina/escaneos /srv/campina/escaneos/_ARCHIVADOS /srv/campina/escaneos/_REVISAR

# Variables nuevas, si no están
grep -q HORAS_SESION_TABLETA server/.env || echo "HORAS_SESION_TABLETA=720" | sudo tee -a server/.env
grep -q SAFI_ESCRITURA server/.env       || echo "SAFI_ESCRITURA=false"     | sudo tee -a server/.env

C="sudo docker compose --env-file server/.env -f server/docker-compose.yml"
$C down && $C up -d --build
$C logs --tail 50 socios
curl -s http://127.0.0.1:8080/api/salud
```

En `/api/salud` deben verse `"pdfDisponible":true`, `"vigilanciaActiva":true` y
`"safiEscritura":false`. Si `pdfDisponible` fuera `false`, revisa que el
Chromium del contenedor exista (`$C exec socios ls -l /usr/bin/chromium*`) y
dilo en tu informe: el sistema funciona igual, pero el formulario final habría
que guardarlo a mano.

## Tarea 5 — Revisar Samba de verdad

El Coordinador instaló Samba, pero el flujo no funcionaba. Ahora que el
servidor ya no borra nada, hay que dejar la carpeta compartida impecable:

1. Comprueba la configuración (`testparm -s`) contra la de `server/README.md`,
   sección 3.4: `path = /srv/campina/escaneos`, `read only = no`,
   `force group = campina`, `create mask = 0660`, `directory mask = 2770`.
2. Comprueba que el usuario de la Jefatura pertenece a los grupos `socios-club`
   y `campina`, y que tiene contraseña de Samba (`sudo pdbedit -L`).
3. Publica también el repositorio en **solo lectura** (sección 3.5): es la
   tercera vista del expediente y evita que un borrado accidental desde un
   escritorio se lleve un expediente entero.
4. Desde el equipo de la Jefatura, deja un archivo de prueba con el nombre
   correcto de un trámite existente y comprueba en la bandeja que aparece
   archivado (pestaña Pendientes → «Revisar la carpeta ahora»). Verifica los
   tres destinos: `_ARCHIVADOS`, `_REVISAR` y el archivo que se queda en espera.
5. Comprueba que el contenedor puede **mover** archivos dentro de la carpeta
   compartida (no solo leerlos): si no pudiera, el vigilante lo avisa en el log
   con «no se pudo trasladar a _ARCHIVADOS».

## Tarea 6 — Usuarios y datos de prueba

```bash
$C exec socios node dist/server/src/cli/usuario.js listar
$C exec socios node dist/server/src/cli/usuario.js sesiones
```

- Deben existir los tres usuarios (`socios`, `contabilidad`, `gerencia`) con el
  **nombre real** del funcionario: es el que se imprime en el reverso del
  formulario.
- Los trámites de prueba que quedaron de los ensayos anteriores **no se borran
  de la base**: se anulan desde la bandeja del Área de Socios («Atender la
  observación» → «Anular el trámite», o el botón de anular de la tarea), que
  deja constancia de quién y por qué. Si el Coordinador prefiere borrarlos de
  raíz, pídele confirmación explícita y hazlo con el respaldo hecho.

## Tarea 7 — Prueba de extremo a extremo en producción (sin tocar SAFI)

Con `SAFI_ESCRITURA=false`, recorre el circuito completo con una afiliación de
prueba y confírmalo por escrito:

1. En la tableta: **Nueva afiliación** de un socio de prueba, con firma y
   fotografía. Al terminar, la app debe decir «registrada y enviada».
2. Bandeja del **Área de Socios**: aparece «Crear en SAFI a …». Ábrela: el panel
   muestra el número de socio, las listas y —si hay credenciales— lo que el CRM
   ya tiene con ese número. Crea el socio a mano en SAFI si el Coordinador lo
   autoriza, o registra identificadores de prueba.
3. Bandeja de **Contabilidad**: la afiliación aparece ahora en «Pendientes».
   Antes de eso debe verse en «En camino». Abre «Ver expediente»: el formulario
   se ve en pantalla, **con la firma**.
4. Marca REVISADA (con número de factura si aplica).
5. Bandeja de **Gerencia**: aparece para aprobar; aprueba.
6. Comprueba que en `/srv/campina/datos/expedientes/<número> <nombre>/` quedaron
   el formulario en PDF y la fotografía.
7. Deja un escaneo de cédula con el nombre exacto que indica la tarea y
   comprueba que se archiva y que el original pasa a `_ARCHIVADOS`.

## Tarea 8 — Encender la escritura en SAFI (solo con autorización)

Cuando el Coordinador lo autorice expresamente:

```bash
sudo sed -i 's/^SAFI_ESCRITURA=.*/SAFI_ESCRITURA=true/' server/.env
$C up -d
```

Y entonces, **una sola alta real**, acompañada: crear un socio desde el panel y
verificar en el CRM que la Cuenta y la ficha quedaron con los datos correctos
(número de socio, secuencia, cédula, tipo de socio, cuotas). Si algo sale mal,
el panel devuelve el mensaje del CRM; cópialo tal cual en tu informe.

Recuerda que falta, del lado del Club: crear `CORRESPONSAL A` en la lista
`cf_917` y sus cuotas `480` y `40`. Hasta entonces, un Corresponsal A no se
puede crear y el panel lo avisa.

## Tarea 9 — Respaldo diario

Incorpora `/srv/campina` al respaldo diario que ya existe para GLPI:

```bash
sudo tar czf /respaldos/campina-socios-$(date +%F).tar.gz -C /srv/campina datos
```

Comprueba que la tarea programada exista y funcione, y dilo en tu informe.

---

## Lo que debes entregar al final

Un informe corto, en español, con:

1. Qué pasó con los documentos que desaparecieron (dónde están hoy) y qué se
   hizo con ellos.
2. Si SAFI fue modificado o no, con la evidencia en la que te basas.
3. Qué cambió en el servidor (versión desplegada, permisos, Samba, variables).
4. El resultado de la prueba de extremo a extremo, paso por paso.
5. Lo que quedó pendiente y de quién depende.
