# Servidor de afiliación de socios — Club La Campiña

Backend de la solución descrita en el informe **CLC-TI-010**. Reúne tres piezas:

| Pieza | Qué hace |
| --- | --- |
| **API** | La consume la aplicación móvil del Área de Socios para registrar afiliaciones y subir documentos. |
| **Bandeja de tareas** | Interfaz web para Contabilidad y Gerencia: revisar y aprobar el ingreso de cada socio. |
| **Repositorio digital** | Archiva los expedientes, vigila la carpeta compartida de escaneos y los publica en el CRM de SAFI. |

---

## 1. Decisiones de diseño

**Convive con GLPI, no lo toca.** Se despliega como contenedor propio en el mismo
servidor Ubuntu que la mesa de ayuda, con su propio puerto, su propio volumen y
límites explícitos de memoria y CPU. GLPI no cambia en nada.

**Sin dependencias nativas.** Usa `node:sqlite`, incorporado en Node desde la
versión 22.5, de modo que la imagen no necesita cadena de compilación y toda la
base de datos es un solo archivo: respaldarla es copiarla.

**Un solo dominio para todo.** El servidor importa el mismo TypeScript que la
aplicación móvil (`src/domain/`): los tipos de socio, las reglas de cada
formulario y la convención de nombres del repositorio se declaran una vez. Si el
Club modifica un formulario, la app y el servidor se alinean solos.

**Nunca archiva a ciegas.** Un documento archivado en el expediente de otro
socio es un incidente de protección de datos. Lo que el vigilante no puede
clasificar sin ambigüedad se traslada a `_REVISAR/` —nunca se borra— y genera una
tarea en la bandeja del Área de Socios explicando qué corregir.

---

## 2. Requisitos

- Ubuntu Server con Docker y el complemento `docker compose`. El mismo servidor
  interno que ya sirve GLPI (`soporte.clublacampina.com.ec`, `192.168.2.185`).
- Samba, para publicar hacia el equipo de la Jefatura de Socios la carpeta de
  escaneos (lectura y escritura) y el repositorio de expedientes (solo lectura).
- **Nada de certificado TLS.** Es un servidor interno y la bandeja se publica
  por HTTP plano, directo en la LAN. El nombre de host ya existe: es el mismo
  que resuelve GLPI. Ver sección 3.6.
- Node 22.5 o superior, **solo** si se ejecuta fuera de contenedor.

---

## 3. Instalación

### 3.1 Preparar el servidor

```bash
sudo mkdir -p /srv/campina/{datos,escaneos/_REVISAR}
sudo useradd -r -u 1500 -s /usr/sbin/nologin campina
sudo chown -R 1500:1500 /srv/campina
sudo chmod 750 /srv/campina/datos      # el expediente no es de lectura pública
sudo chmod 2770 /srv/campina/escaneos  # setgid: lo que deje el escáner hereda el grupo
```

### 3.2 Desplegar el código

```bash
sudo git clone <repositorio> /opt/campina-socios
cd /opt/campina-socios

cp server/.env.example server/.env
# Genere el secreto de sesión y péguelo en SECRETO_SESION:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
sudo nano server/.env

sudo docker compose --env-file server/.env -f server/docker-compose.yml up -d --build
```

Comprobación:

```bash
curl -s http://127.0.0.1:8080/api/salud
# {"ok":true,"safiModo":"MANUAL","vigilanciaActiva":true,...}
```

### 3.3 Crear los usuarios de cada área

Cada área entra con su propio usuario y solo ve su bandeja. Si no se indica
contraseña, se genera una robusta y se muestra **una sola vez**:

```bash
D="docker compose --env-file server/.env -f server/docker-compose.yml exec socios"

$D node dist/server/src/cli/usuario.js crear socios       "NOMBRE APELLIDO" SOCIOS
$D node dist/server/src/cli/usuario.js crear contabilidad  "NOMBRE APELLIDO" CONTABILIDAD
$D node dist/server/src/cli/usuario.js crear gerencia      "NOMBRE APELLIDO" GERENCIA

$D node dist/server/src/cli/usuario.js listar
$D node dist/server/src/cli/usuario.js clave contabilidad   # restablecer una contraseña
```

El nombre que se registre aquí es el que quedará impreso en la constancia
«Revisado» o «Aprobado» del reverso del formulario, así que debe ser el del
funcionario real, no un genérico.

### 3.4 Publicar la carpeta de escaneos por Samba

En `/etc/samba/smb.conf`:

```ini
[escaneos-socios]
   comment = Escaneos de expedientes — Área de Socios
   path = /srv/campina/escaneos
   browseable = yes
   read only = no
   valid users = @socios-club
   force group = campina
   create mask = 0660
   directory mask = 2770
   # El vigilante retira los archivos ya archivados; no hace falta papelera.
   vfs objects =
```

```bash
sudo groupadd socios-club
sudo usermod -aG socios-club,campina <usuario-de-la-jefatura>
sudo smbpasswd -a <usuario-de-la-jefatura>
sudo systemctl restart smbd
```

En el equipo de la Jefatura de Socios, conectar una unidad de red a
`\\<ip-del-servidor>\escaneos-socios` y configurar el escáner para que guarde
ahí. La convención de nombres está en la pestaña **«Cómo escanear»** de la propia
bandeja, con un comprobador que valida un nombre antes de escanear.

### 3.5 Publicar el repositorio de expedientes en solo lectura

El expediente queda en dos sitios independientes: el módulo Documentos de SAFI y
el repositorio de este servidor. El segundo es el respaldo, y conviene que la
Jefatura de Socios pueda verlo desde su equipo sin pasar por el CRM.

**En solo lectura, y esto no es un detalle menor:** un borrado accidental desde
un escritorio compartido se llevaría un expediente completo, y en materia de
protección de datos eso es un incidente, no un descuido. Quien deposita escribe
en la carpeta de escaneos; el repositorio ya archivado solo se mira.

```ini
[expedientes-socios]
   comment = Expedientes archivados — solo lectura
   path = /srv/campina/datos/expedientes
   browseable = yes
   read only = yes
   # Refuerza el «read only» aunque alguien cambie lo anterior por descuido.
   writable = no
   valid users = @socios-club
   force group = campina
```

```bash
sudo systemctl restart smbd
```

En el equipo de la Jefatura, conectar una segunda unidad de red a
`\\<ip-del-servidor>\expedientes-socios`.

Este compartido **no sustituye al respaldo**: la copia diaria de `/srv/campina/datos`
(sección 6) sigue siendo la que protege ante una pérdida del servidor.

### 3.6 Cómo se publica: directo, sin proxy ni TLS

Este servidor es interno (`soporte.clublacampina.com.ec`, red del Club) y no
tiene certificado. **No hace falta nginx ni TLS para esto**: por defecto
(`BIND_HOST=0.0.0.0` en `server/.env.example`) el contenedor publica su puerto
directo en la interfaz de la LAN, y la bandeja queda accesible así:

```
http://soporte.clublacampina.com.ec:8080
```

El nombre de host **ya existe** en el DNS del Club —es el mismo que resuelve
GLPI—, así que no hay que dar de alta nada nuevo. Con `URL_PUBLICA=http://...`
(sin `s`), la cookie de sesión no se marca `Secure` y el inicio de sesión
funciona con normalidad sobre HTTP plano (ver `server/src/http/sesion.ts`).

**Si más adelante se quisiera un proxy inverso** —por ejemplo, para servir esto
en el puerto 80 junto a GLPI, o para añadir TLS con un certificado propio—, la
receta es la de siempre (nginx, con `proxy_pass` al `127.0.0.1:8080` del
contenedor), pero entonces hay que cambiar **dos cosas a la vez** en
`server/.env`, nunca una sin la otra:

```bash
BIND_HOST=127.0.0.1      # el contenedor deja de publicarse directo en la LAN
TRUST_PROXY=true         # el servidor pasa a fiarse de X-Forwarded-For
```

Activar `TRUST_PROXY` sin que exista de verdad un proxy que sobrescriba esa
cabecera permite que cualquier equipo de la red falsee su IP y se salte el
límite de intentos de acceso (`server/src/http/intentos.ts`). Mientras no haya
proxy, `TRUST_PROXY` debe quedarse en `false`, que es el valor por defecto.

---

## 4. Operación

```bash
C="docker compose --env-file server/.env -f server/docker-compose.yml"

$C logs -f socios          # registro del servidor
$C restart socios          # reinicio
$C down && $C up -d --build  # actualización tras un git pull
```

### Respaldo

Todo el sistema son dos rutas. Con el contenedor detenido, o con SQLite en
modo WAL (que es el que usa), basta:

```bash
sudo tar czf /respaldos/campina-socios-$(date +%F).tar.gz -C /srv/campina datos
```

Se recomienda incorporarlo al respaldo diario que ya existe para GLPI.

### Restauración

```bash
$C down
sudo tar xzf /respaldos/campina-socios-AAAA-MM-DD.tar.gz -C /srv/campina
sudo chown -R 1500:1500 /srv/campina/datos
$C up -d
```

---

## 5. Estructura de datos en disco

```
/srv/campina/
├── datos/
│   ├── campina.db                          Base SQLite (usuarios, trámites, bitácora)
│   └── expedientes/                        Samba: SOLO LECTURA
│       └── 280 COQUE VEGA JOEL SEBASTIAN/  Una carpeta por socio titular
│           ├── 280 COQUE VEGA JOEL SEBASTIAN.pdf            Formulario + carta
│           ├── 280 COQUE VEGA JOEL SEBASTIAN CEDULA.pdf
│           └── 280-1 COQUE VEGA ANA MARIA CEDULA.pdf        Documento del dependiente
└── escaneos/                               Samba: lectura y escritura
    └── _REVISAR/                           Lo que el vigilante no supo clasificar
```

La carpeta del socio titular es la unidad que corresponde a una **Cuenta** del
CRM de SAFI: lo que se archiva aquí es exactamente lo que se publica allá.

Este repositorio es, además, **el respaldo del expediente digital**: el mismo
documento queda en dos sitios independientes, aquí y en el módulo Documentos de
SAFI. Por eso se publica en solo lectura y por eso entra completo en la copia
diaria de la sección 4.

---

## 6. Integración con el CRM de SAFI

SAFI es un **vTiger 7**. El contrato quedó levantado y verificado creando
registros de prueba reales; el detalle completo está en `SAFI-INTEGRACION.md`.

El servidor opera en tres modos, según `SAFI_MODO`:

- **`API`** — el modo de trabajo. Usa `webservice.php`, la interfaz REST de
  vTiger. No depende del HTML ni del token anti-CSRF, y además lee del propio
  CRM las listas de valores con `operation=describe`, de modo que un valor que
  el Club añada allá aparece en el panel sin tocar el código.
  `SAFI_CLAVE` debe ser la **clave de acceso** (Access Key) del usuario, que
  está en el CRM bajo Mis Preferencias → Detalles del usuario. No es su
  contraseña.

- **`HTTP`** — plan B, por si el servicio web estuviera deshabilitado en la
  instalación. Replica la petición que el propio navegador envía al guardar,
  leyendo el token anti-CSRF antes de cada envío. Aquí `SAFI_CLAVE` sí es la
  contraseña.

- **`MANUAL`** — sin integración. El expediente queda completo y ordenado en el
  repositorio, y la bandeja del Área de Socios muestra qué está pendiente de
  subir. Es el valor por defecto para que un despliegue sin credenciales
  arranque igual.

Cambiar de modo no requiere tocar nada más: los documentos ya archivados se
reencolan y se publican.

### Cuidado con el puerto

`SAFI_BASE_URL` **debe llevar el puerto**. El CRM del Club escucha en el 8080, y
sin él la petición se va al 80, donde no hay nada: `webservice.php` no devuelve
un error, no devuelve nada.

```
Correcto     http://192.168.2.100:8080/saficrm_clubcampina_75
Incorrecto   http://192.168.2.100/saficrm_clubcampina_75
```

El servidor lo comprueba al arrancar y se niega a levantar con una dirección sin
puerto. Para diagnosticar en caliente, `GET /api/safi/diagnostico` recorre el
saludo y el acceso paso a paso y dice en cuál falla; la bandeja del Área de
Socios lo expone como un botón en la pestaña «Cómo escanear».

### Cuándo se escribe en SAFI

El alta la dispara el Área de Socios desde su bandeja, justo después de que la
tableta registre la afiliación y antes de que Contabilidad revise —porque
Contabilidad revisa comprobando el ingreso en el CRM—. El panel recoge el número
de socio y los campos que SAFI guarda como listas cerradas, y al confirmar crea
la **Cuenta** (solo si la persona es titular) y su ficha de **Socio**.

Los documentos del expediente se publican después, contra la Cuenta, cuando la
Gerencia aprueba.

---

## 7. API

Todas las rutas exigen sesión salvo `/api/salud`.

| Método | Ruta | Área | Qué hace |
| --- | --- | --- | --- |
| `POST` | `/api/sesion` | — | Inicia sesión. Devuelve cookie firmada. |
| `DELETE` | `/api/sesion` | cualquiera | Cierra la sesión. |
| `GET` | `/api/bandeja` | cualquiera | Tareas pendientes y atendidas del área. |
| `GET` | `/api/solicitudes` | cualquiera | Listado de trámites. |
| `GET` | `/api/solicitudes/:id` | cualquiera | Expediente completo y sus documentos. |
| `POST` | `/api/solicitudes` | Socios | Registra una afiliación desde la tableta. |
| `POST` | `/api/solicitudes/:id/numeros` | Socios | Número de socio y de tarjeta. |
| `GET` | `/api/solicitudes/:id/safi` | Socios | Propuesta, listas de valores del CRM y avisos para el alta. |
| `POST` | `/api/solicitudes/:id/safi` | Socios | Confirma los campos y crea la Cuenta y el Socio en SAFI. |
| `GET` | `/api/safi/diagnostico` | Socios | Comprueba la conexión con el CRM paso a paso. |
| `POST` | `/api/solicitudes/:id/revisar` | Contabilidad | Constancia REVISADO + casilla FC (opcional). |
| `POST` | `/api/solicitudes/:id/aprobar` | Gerencia | Constancia APROBADO. |
| `POST` | `/api/solicitudes/:id/observar` | Contabilidad, Gerencia | Devuelve el trámite con observación. |
| `POST` | `/api/expediente/:id/documentos` | Socios | Sube un documento capturado. |
| `GET` | `/api/expediente/documentos/:archivoId` | cualquiera | Descarga un documento. |
| `POST` | `/api/escaneos/revisar` | Socios | Fuerza una pasada del vigilante. |
| `GET` | `/api/escaneos/comprobar?nombre=` | Socios | Valida un nombre de archivo. |
| `POST` | `/api/safi/reintentar` | Socios | Reintenta la cola de publicación. |
| `GET` | `/api/salud` | — | Estado del servicio. |

---

## 8. Protección de datos

- Las contraseñas se almacenan con `scrypt` y una sal por usuario; la
  comparación es de tiempo constante.
- La cookie de sesión es `httpOnly`, `sameSite=lax` y `secure` en producción, y
  solo contiene el identificador de una sesión almacenada en la base: el
  servidor puede revocarla en cualquier momento.
- Toda actuación sobre un expediente —consulta, descarga, revisión, aprobación,
  archivo de un escaneo— queda en la tabla `bitacora` con fecha, hora, usuario y
  área. Es la evidencia que exige la LOPDP.
- El registro del servidor no escribe cédulas ni nombres: los datos personales
  viven en la base, no en los logs.
- El contenedor corre como usuario sin privilegios y con `no-new-privileges`.

---

## 9. Desarrollo local

```bash
cd server
npm install
npm run build

export DATOS_DIR=./.datos ESCANEOS_DIR=./.escaneos
export SECRETO_SESION=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export NODE_ENV=development PUERTO=8080

node dist/server/src/cli/usuario.js crear socios "PRUEBA LOCAL" SOCIOS clave123
npm start
```

La bandeja queda en `http://localhost:8080`.
