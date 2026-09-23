# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código.
>
> Escrito el **23/09/2026**, después de la prueba del Coordinador con el sistema
> completo. La versión anterior de este archivo —y su nota «Atendido el
> 19/09/2026»— sigue en el historial de la rama.
>
> Cópielo entero como primer mensaje de esa sesión.

> **Atendido el 23/09/2026** por el Claude del servidor. Este encargo se conserva
> tal como llegó.
>
> **Corrección del Coordinador sobre el D-C, aplicada.** «El Parentesco siempre
> debe ser el del socio oficial con el que tenga relación»: en un **D-C es el
> oficial FAE del que desciende —su abuelo—**, nunca su padre o madre D-B. El
> D-C sigue *dependiendo* de un D-B (así lo dice el PGS1-11 y se sigue
> comprobando), pero el Parentesco y la línea «de …» son del oficial.
> - En SAFI no se puede deducir: de las 535 fichas D-B, **441 tienen el
>   Parentesco vacío** y ninguna guarda el número de su oficial. Así que se pide.
> - Dominio: `numeroOficialFae` y `oficialFaeVerificado` (opcionales, sin cambio
>   de esquema); `oficialDelParentesco()` y `REGLA_OFICIAL` en `sociosSafi.ts`;
>   `parentescoDe` y `socioDelQueDepende` salen de ahí. `validarTipo` no exige
>   el número, pero rechaza uno que SAFI ya dijo que no es Activo ni Fundador.
> - Servidor: `comprobarReferencias` comprueba ese oficial (`oficialFae`); si no
>   hay número, **aviso bloqueante**. `conOficialDelDC` lo toma del panel, de la
>   tableta o —si el D-B se afilió por este sistema— de su trámite
>   (`oficialDeUnDependienteB`). `fijarVerificaciones` lo guarda.
> - Bandeja: en el panel de SAFI de un D-C, campo «N.º de socio del oficial FAE
>   del que desciende», que consulta `GET /api/safi/socios` al escribirlo.
> - Lo de la tableta está en `PROMPT-CLAUDE-DESARROLLO.md`.
>
> **Tu revisión.** `referencias.ts`, `consultarSocio` y el alta, bien: conservan
> los tres ajustes del 19/09. Sin otros cambios.
>
> **Tarea 2, contra el CRM real** (contenedor aislado, escritura apagada), todo
> en verde: Activo N.º 1 con cédula, grado, teléfono y estado; la misma ficha por
> su cédula; un D-B con «PARTICULAR DEPENDIENTE B SOLTERO» y secuencia 00; una
> cónyuge por cédula con secuencia 01; 99999 → `null`; la ruta antigua del
> oficial sigue en `VERIFICADO`; 400 y 403 donde toca. Y el D-C: sin oficial,
> con un Particular A y con el propio D-B → 409; con un Activo pasa, y el
> Parentesco y el «de …» salen del oficial.
>
> **Lo que dice el CRM:**
> - D-B: las 288 SOLTERO y las 247 CASADO tienen secuencia `00`.
> - «CONYUGE Y PADRES TITULARES»: 61 fichas, 60 con secuencia `00`: son
>   titulares con Cuenta propia; bien que cuenten como titular.
> - `cf_911` en 5.977 fichas: Activo 4.758, **Inactivo 1.116**, DADO DE BAJA 70,
>   Suspendido 26, Completar Aqui 7. El aviso «estado distinto de Activo» saldrá
>   a menudo.
> - `cf_977` en 2.843 Cuentas: siempre punto y dos decimales (`40.00`): coincide.
> - **`homephone`: 2.723 fichas con 7 dígitos** (sin código de provincia), 390
>   con 8, 207 con 9, 2.528 vacías. `convencionalDesdeSafi` deja los 7 dígitos y
>   la validación del convencional los rechazará. Ver el encargo de desarrollo.
> - `mobile`: 4.384 con 10 dígitos, 323 con 9 (se completan bien), 12 con dos
>   números separados por « / » (se toma el primero).
>
> **Reconstruida y desplegada** con respaldo
> `campina_20260923_133528_antes-de-reconstruir-parentesco-dc`. La base no se
> vació: siguen los 2 trámites de prueba.
>
> **Tarea 3, viable y hecha:** Apache escucha en el 80 y era el único sitio.
> Sitio aparte `socios-afiliaciones.conf` (el nombre hace que cargue después de
> `glpi.conf`, que sigue siendo el sitio por defecto), proxy a `127.0.0.1:8080`
> con `ProxyPreserveHost`, `X-Forwarded-Proto`, 120 s y 30 MB; módulos `proxy`,
> `proxy_http` y `headers` activados. Respaldo de `/etc/apache2`, `configtest`
> y recarga sin corte. **GLPI responde igual antes y después** (por nombre, por
> IP y con un nombre desconocido). `URL_PUBLICA` ya es el nombre nuevo (solo
> gobierna la cookie `Secure` y el mensaje de arranque). `BIND_HOST` y
> `TRUST_PROXY` siguen igual hasta que el Coordinador cambie la tableta y los
> navegadores. Falta el registro en su DNS interno.
>
> **TLS, para más adelante:** el sitio ya está separado, así que añadir `https`
> es añadir un `<VirtualHost *:443>` a este mismo archivo. Para la tableta hace
> falta un certificado público: Let's Encrypt con reto DNS-01 exige poder
> publicar registros TXT en la zona **pública** de `clublacampina.com.ec`, que
> hoy no tiene este nombre (solo lo resuelve el DNS interno).

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE — Club La Campiña.
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema vive en `/opt/campina-socios` (contenedor `campina-socios`) con sus
datos en `/srv/campina`.

Gracias por la ronda del 19/09: los tres ajustes a la verificación del oficial
eran justos y se conservan tal cual en el código nuevo (ver abajo). Esta ronda
trae **cuatro cambios de funcionamiento** que tocan `src/domain/`, `server/`,
`web/`, `src/services/formularios/` y la tableta: **hay que reconstruir la
imagen**. Y una tarea nueva: **publicar la bandeja con un nombre propio**,
`afiliaciones.clublacampina.com.ec`, en lugar de `192.168.2.185:8080`.

## Reglas de esta sesión

1. **Respalda antes de reconstruir** y antes de tocar la configuración del
   servidor web.
2. **SAFI tiene la escritura habilitada** y es el CRM real del Club. Esta ronda
   **solo lee** del CRM: no crees ni modifiques fichas.
3. **GLPI no se toca.** Si el nombre nuevo obliga a añadir un sitio al servidor
   web que sirve GLPI, es un sitio **aparte**: el de GLPI no cambia, y GLPI debe
   responder igual antes y después (compruébalo).
4. **La base no se vacía** esta vez: el Coordinador está probando con datos
   reales de prueba.
5. Informa en español, en lenguaje llano.

---

## Los cuatro cambios

### 1. Garantes, titulares y el socio del que se depende: se traen de SAFI

**Lo que pidió.** Que en la tableta baste escribir el **número de socio o la
cédula** de un garante —y del titular de un dependiente— para traer del CRM todo
lo demás, como ya pasaba con el oficial de los D-A y D-B.

**Decisiones del Coordinador** (23/09/2026):

| Quién | Tiene que ser en SAFI (`cf_917`) |
| --- | --- |
| Garantes | `ACTIVO` o `FUNDADOR` |
| Titular de los padres | `ACTIVO` o `FUNDADOR` |
| Titular del cónyuge o del juvenil | Cualquier socio titular salvo `PARTICULAR B` (y los suscriptores, que no son socios) |
| Oficial de un D-A o D-B | `ACTIVO` o `FUNDADOR` (como el 19/09) |
| Socio del que depende un **D-C** | `PARTICULAR DEPENDIENTE B SOLTERO` o `… CASADO` — así lo dice el PGS1-11 |

Mismo patrón que el 19/09: sin red la tableta deja avanzar; el panel de SAFI
vuelve a consultar antes del alta; **bloquea** (`COHERENCIA`) si el CRM dice que
no existe o no es de la categoría; **avisa sin bloquear** si no pudo consultar.
Y tu regla: **lo que trae la tableta nunca se da por verificado**.

**Dónde está:**

- `src/domain/sociosSafi.ts` (nuevo): las reglas por papel (`reglaDependencia`,
  `reglaTitular`, `REGLA_GARANTE`, `admiteSocio`), `verificacionDe` y
  `estadoReferencia`, que vuelve a juzgar una verificación guardada con la
  categoría del momento. `TIPO_SOCIO_SAFI` **se mudó aquí** desde `campos.ts`
  (que lo reexporta): la tableta también lo necesita. `CONYUGE Y PADRES
  TITULARES` cuenta como titular.
- `DatosAfiliacion.titularVerificado` y `DatosGarante.verificacion` (nuevos,
  opcionales). `oficialDependencia` sirve ahora también al D-C; sus
  verificaciones antiguas con `NO_ES_ACTIVO_NI_FUNDADOR` se siguen leyendo.
  **Sin cambio de esquema.**
- `AdaptadorSafi.consultarSocio({ numeroSocio?, cedula? })` sustituye a
  `consultarOficial`: por número, la ficha **`00`** (tu regla: `0` o vacía solo
  si no hay `00`); por cédula, la ficha de esa persona, con su secuencia. Trae
  además `cf_927`, `cf_911`, `homephone` y `mobile`.
- **`GET /api/safi/socios?numero=…`** o **`?cedula=…`** (área SOCIOS): lo que usa
  la tableta nueva. **`GET /api/safi/oficiales/:numero` se conserva** para la
  tableta que el Coordinador tiene instalada hoy, y responde igual que antes.
- `server/src/safi/referencias.ts` (nuevo) → `comprobarReferencias()` sustituye
  a `oficial.ts` (**borrado**): el oficial o el D-B, el titular y cada garante, en
  paralelo. Conserva tus tres ajustes: sin consulta, aviso que menciona lo que
  dijo la tableta y verificación `null`. Añade dos avisos que **no** bloquean:
  cédula del trámite distinta a la de SAFI, y estado `cf_911` distinto de
  «Activo». El «titular no encontrado» no se repite: ya lo da `verificar`.
- `api.ts`, alta: el Parentesco usa solo lo que el servidor acaba de consultar;
  `fijarOficialDependencia` pasa a **`fijarVerificaciones`** (guarda también la
  del titular). `registro.ts` → `parentescoDe`: el D-C, de su D-B; el cónyuge,
  padres y juvenil, del titular según SAFI si se comprobó y, si no, lo escrito
  (como hasta hoy).

### 2. PGS1-11 con la línea «de …» y hoja de solicitud sin la cédula repetida

- En el PGS1-11 de un cónyuge, padres, juvenil, D-A, D-B o D-C, junto a la
  casilla marcada va **«de GRADO NOMBRES APELLIDOS»** del socio del que depende
  —lo mismo que su Parentesco—. Del D-A, D-B o D-C, solo si está verificado; si
  no, «de socio N.º …» (`socioDelQueDepende`, `layoutFicha.ts`). La hoja sigue
  cabiendo en una página.
- Las hojas «SOLICITUD» (R-PGS1-22 y compañía) ya no repiten la **cédula del
  aspirante** en su recuadro: la dice el «Yo, … con C.I. …». La del garante
  sigue.

### 3. Carta de compromiso: una modalidad de débito y cuotas automáticas

- `DatosCartaCompromiso.modalidadDebito` (`CUENTA` | `TARJETA`, opcional; las
  cartas antiguas la deducen de lo llenado). La carta imprime **solo** la
  elegida, con las palabras del original, y «En caso de no existir fondos en
  ambas modalidades de pago» queda en «En caso de no existir fondos». Sin
  modalidad, se imprime como el original.
- Las **cuotas de la carta salen del tarifario** y no se preguntan
  (`conCuotasDelTarifario`). **`depurarEntrante` las impone** al registrar y al
  corregir: la tableta instalada hoy todavía deja escribirlas.

### 4. «Valor Cuota» de la Cuenta = la cuota elegida

`cf_977` ya no es un campo libre del panel: es **la cuota que la Jefatura elige**,
la mensual si la eligió y si no la anual (`valorCuotaDe` en `registro.ts`), con
el formato de siempre (`40.00`). El panel lo muestra de solo lectura y **el
servidor lo recalcula en el alta**, llegue lo que llegue. Al elegir la cuota,
las Subscripciones pasan a «Mensual» o «Anual» si estaban en una de esas dos.

Y en `web/`: **favicon nuevo** (`web/img/favicon.ico`, el que eligió el
Coordinador). La paleta de la bandeja no cambia.

---

## Lo que probé, y lo que no pude

El banco de siempre —la tableta en Node contra `server/dist`, base nueva,
`SAFI_MODO=MANUAL`—: **55 comprobaciones de esta ronda, todas en verde**, y las
**39 + 30 anteriores siguen en verde**. `comprobarReferencias` y el Parentesco
se probaron además contra un **SAFI simulado** (Activo, D-B casado, P-A, P-B,
suspendido, inexistente y caído). Los formularios se generaron y revisé las
páginas impresas: PGS1-11 de cónyuge y de D-A con su «de …» en una página,
R-PGS1-22 sin la cédula repetida, carta con solo la tarjeta.

**Lo que no pude probar, porque exige el CRM real:** `consultarSocio` contra
SAFI, sobre todo la búsqueda por `cf_927` y los campos nuevos del `SELECT`.

---

## Tarea 1 — Revisar, actualizar y reconstruir

```bash
cd /opt/campina-socios
sudo git fetch origin
sudo git status
sudo git log --oneline -3 origin/despliegue-servidor
sudo git pull origin despliegue-servidor
sudo git diff --stat ORIG_HEAD HEAD -- server web src/domain src/services/formularios
```

Debe mostrar cambios en `server/`, `web/`, `src/domain/` y
`src/services/formularios/`, y `server/src/safi/oficial.ts` borrado. Léete
`referencias.ts`, `consultarSocio` y el alta en `api.ts`; si algo no te
convence, dilo antes de desplegar. Respalda y reconstruye como de costumbre.

## Tarea 2 — Probar la consulta de socios contra SAFI (solo lectura)

Como el 19/09: contenedor aislado, base temporal, escritura apagada. Con la
sesión de `socios`:

1. `GET /api/safi/socios?numero=<un Socio Activo real>` → su ficha `00`, con
   **cédula, grado, teléfonos y estado**.
2. `?cedula=<la cédula de ese mismo socio>` → la misma ficha.
3. `?numero=<un D-B real>` → `cf_917` «PARTICULAR DEPENDIENTE B …» y secuencia
   `00`.
4. `?cedula=<la de una cónyuge o un juvenil>` → su ficha, con secuencia `01` o
   la que tenga (la tableta la rechaza como garante).
5. `?numero=99999` → `socio: null`.
6. `GET /api/safi/oficiales/1` → sigue devolviendo `VERIFICADO`.
7. Letras en `numero` o una cédula de 9 dígitos → 400; con la sesión de
   Contabilidad → 403.

Y confirma en el CRM, en solo lectura:

- que **las fichas D-B tienen secuencia `00`** y sus dos valores exactos de
  `cf_917`;
- que existe «CONYUGE Y PADRES TITULARES» en `cf_917` y a quién corresponde;
- los **valores distintos de `cf_911`** (Estado Socio) —el código trata como
  alerta todo lo que no sea «Activo»—;
- el **formato de `cf_977`** en Cuentas existentes (`40.00`, `40` o `40,00`):
  el sistema envía `40.00`, como antes;
- cómo vienen `homephone` y `mobile` (con prefijo, guiones…): la tableta los
  lleva a `0991234567` y `022345678`.

Si algo falla, corrígelo en `adaptador.ts` y dilo. **No hagas altas de prueba.**

## Tarea 3 — La bandeja en `afiliaciones.clublacampina.com.ec`

**Lo que pidió el Coordinador:** abrir la bandeja con un nombre en lugar de
`192.168.2.185:8080`. Él añade el registro en el **DNS interno** (el
cortafuegos) cuando le digas que el servidor está listo. **Primero dime si es
viable** tal como se plantea aquí.

Lo que propongo, a confirmar por ti:

1. **Quién escucha en el 80.** Muy probablemente el servidor web de GLPI
   (Apache o nginx): `sudo ss -ltnp '( sport = :80 or sport = :443 )'`.
2. **Un sitio aparte**, por nombre, para `afiliaciones.clublacampina.com.ec`,
   que haga de proxy inverso a `http://127.0.0.1:8080`:
   - con `Host`, `X-Forwarded-For` y `X-Forwarded-Proto`;
   - **límite de cuerpo de 30 MB** o más (los escaneos suben hasta
     `MAX_ARCHIVO_MB=25`) y **120 s** de espera (el PDF final y el CRM tardan);
   - el sitio de GLPI, intacto. Respaldo de la configuración, `configtest` /
     `nginx -t` antes de recargar, y GLPI comprobado después.
   - Se puede probar antes de que exista el DNS:
     `curl -H 'Host: afiliaciones.clublacampina.com.ec' http://127.0.0.1/api/salud`.
3. **`URL_PUBLICA=http://afiliaciones.clublacampina.com.ec`** en `server/.env`
   (va en el pie de los formularios y en los enlaces).
4. **`BIND_HOST` y `TRUST_PROXY`, juntos y más tarde.** Mientras la tableta
   instalada siga apuntando a `:8080`, el puerto tiene que seguir abierto a la
   LAN, y entonces `TRUST_PROXY` debe seguir en `false` (ver
   `docker-compose.yml`: nunca uno sin el otro). Cuando el Coordinador haya
   cambiado la dirección en la tableta y en los tres navegadores, pasa a
   `BIND_HOST=127.0.0.1` **y** `TRUST_PROXY=true` a la vez. Mientras tanto, todos
   los accesos por el nombre llegan con la IP del proxy: el freno de intentos
   fallidos va por usuario **y** IP, así que no bloquea a nadie más.
5. Con el DNS puesto: `getent hosts afiliaciones.clublacampina.com.ec` desde el
   servidor y desde un equipo de la LAN, e inicio de sesión en la bandeja por el
   nombre.

**TLS no entra en esta ronda**, pero déjalo anotado: la política que el Club
presentará a la DIGERCIC compromete `https://`. Android no confía en una CA
propia instalada por el usuario, así que para la tableta la vía natural sería un
certificado público (Let's Encrypt con reto DNS-01, al ser un dominio público del
Club). Dime qué ves.

## Tarea 4 — Cerrar

- Cuando el nombre funcione, cambia en `PROCESO-AFILIACION.md` la línea «Bandeja
  de tareas: http://soporte.clublacampina.com.ec:8080» y súbelo a la rama.
- Dile al Coordinador qué tiene que cambiar él: la dirección de la tableta en
  «Configuración y envío» (`http://afiliaciones.clublacampina.com.ec`, sin
  puerto) y los accesos directos de los tres navegadores.

---

## Lo que queda pendiente y no es de esta ronda

- **La tableta nueva** la instala el Coordinador; hasta entonces la actual sigue
  funcionando con este servidor (por eso se conserva la ruta del oficial).
- **Firma One Shot:** en cotización con varios proveedores. La tableta ya
  enseña el **formulario completo antes de firmar**, que es lo que esa firma
  pedirá. Nada más cambia mientras tanto.
- **SNIC (DIGERCIC):** documentación del contrato de adhesión preparada, por
  firmar.
- `CORRESPONSAL A` en `cf_917` (con sus cuotas 480 y 40): lo crea el Club en
  SAFI. El formulario R-PGS1-26 ya se genera.
- La lista de documentos a escanear por tipo de socio, que el Coordinador
  confirmará.

## Lo que debes entregar al final

Un informe corto, en español, con:

1. Tu revisión de las piezas nuevas y si cambiaste algo.
2. Los resultados de la tarea 2 y lo que encontraste en el CRM.
3. La reconstrucción: nombre del respaldo y que el sistema arrancó.
4. La viabilidad del nombre nuevo y, si la hay, qué configuraste y qué falta
   (el DNS del Coordinador, el cambio de dirección en la tableta, el paso a
   `BIND_HOST=127.0.0.1`).
