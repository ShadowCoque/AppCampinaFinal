# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código.
>
> Escrito el **19/09/2026**, después de las pruebas del Coordinador con el
> sistema completo. La versión anterior de este archivo sigue en el historial
> de la rama.
>
> Cópielo entero como primer mensaje de esa sesión.

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE — Club La Campiña.
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema vive en `/opt/campina-socios` (contenedor `campina-socios`) con sus
datos en `/srv/campina`.

Esta ronda trae **tres cambios de funcionamiento** que pidió el Coordinador y
que tocan `src/domain/`, `server/`, `web/` y la tableta: **hay que reconstruir
la imagen**. Los escribí de punta a punta y los probé contra tu código
compilado, **salvo la consulta al CRM**, que desde aquí no se puede hacer: esa
parte te toca comprobarla a ti, en solo lectura. Después, el Coordinador pide
**vaciar la base** para una prueba real con la Jefatura de Socios.

## Reglas de esta sesión

1. **Respalda antes de reconstruir y antes de vaciar.** Dos respaldos, uno por
   paso, con su nombre.
2. **SAFI tiene la escritura habilitada** y es el CRM real del Club. Esta ronda
   **solo lee** del CRM: no crees ni modifiques fichas. Lo que el Coordinador
   borró o borre en SAFI lo hace él.
3. **GLPI no se toca.**
4. **La tableta tampoco:** el Coordinador borra él mismo lo que tenga guardado.
5. Informa en español, en lenguaje llano.

---

## Los tres cambios

### 1. «Devolver con observación» elige destino, y todo lleva hora

**Lo que pidió.** La Gerencia elige a quién devolver: al **Área de Socios** o a
**Contabilidad**. Contabilidad devuelve siempre al Área de Socios. Y todo lo que
deja rastro, con **hora** además de fecha.

**Cómo queda el recorrido:**

| Devuelve | A | Al atenderlo, vuelve a |
| --- | --- | --- |
| Contabilidad | Área de Socios (siempre) | Contabilidad — como ya hacía |
| Gerencia | Área de Socios | La Gerencia directo — como ya hacía; la revisión sigue en pie |
| Gerencia | **Contabilidad** (nuevo) | La Gerencia, cuando Contabilidad la marca revisada otra vez |

**Dónde está:**

- `src/domain/solicitud.ts`: `tramite.devolucion` pasa a `DevolucionTramite`,
  con `destino?: Area` (ausente = Área de Socios, así que las devoluciones
  guardadas siguen valiendo) y `numeroFacturaAnterior?`. `destinoDevolucion()`
  lo lee. **Sin cambio de esquema.**
- `server/src/db/solicitudes.ts` → `devolver()`: si la Gerencia devuelve a
  Contabilidad, el trámite **vuelve a `REGISTRADA`** con `revision: null` —para
  que el reverso no imprima un REVISADO que ya no vale— y guarda el FC anterior
  en la devolución. Todo lo demás del recorrido (tareas, `revisar()`, que ya
  limpiaba la devolución, `reenviar()`) funciona sin tocarse.
- `server/src/http/api.ts` → `POST /api/solicitudes/:id/observar` acepta
  `destino`, pero **solo le hace caso si quien devuelve es la Gerencia**.
- `src/domain/tareas.ts`: la tarea de Contabilidad se titula **«Revisar de nuevo
  la afiliación …»** y trae la observación de la Gerencia.
- `web/`: en el diálogo de la Gerencia aparece «Si lo devuelve, ¿a quién?»
  (Área de Socios por defecto); el aviso final dice a quién fue; el expediente
  dice «Devuelta a …»; y al revisar de nuevo, el FC anterior se ofrece solo.
- **La hora:** `formatFechaHora` (dominio) y `fechaHora` (bandeja) formatean
  ahora **en hora del Ecuador de forma explícita** (UTC−5 fija), sin depender
  de la zona del equipo. `observacionesDeArea` —las observaciones del reverso—
  imprimía solo la fecha, y además tomada de la hora UTC: una observación
  escrita después de las 19:00 salía con el día siguiente. Ahora lleva fecha y
  hora correctas. El `TZ` del compose sigue siendo correcto; esto es para que
  no dependa de él.

### 2. Corregir una afiliación desde la tableta

**Lo que pasó.** El Coordinador registró un Socio Fundador con la cédula de
otro socio que ya existía en el CRM. Tu panel lo detectó bien, pero la única
salida era anular y capturar todo de nuevo para cambiar diez dígitos. Pide
poder **corregir cualquier dato** en la tableta.

**Decisiones del Coordinador:** se corrige libremente **mientras no exista en
SAFI**; si ya existe, solo cuando se lo **devuelven al Área de Socios**, con
aviso de corregir también el CRM a mano, y sin cambiar la categoría. **El socio
no vuelve a firmar**: la trazabilidad es el historial, campo por campo.

**Dónde está:**

- `src/domain/correccion.ts` (nuevo): `puedeCorregirse()` —la regla, la misma
  en los dos lados— y `cambiosEntre()` / `describirCambios()`.
- **`PUT /api/solicitudes/:id`** (área SOCIOS), `corregirSolicitud()` en
  `db/solicitudes.ts`: pasa los datos por el mismo `depurarEntrante` del
  registro (fuerza fija, garantes sin rutas…), conserva código, estado,
  constancias y expediente, calcula él mismo qué cambió (no se fía del cliente)
  y lo deja en historial y bitácora (`AFILIACION_CORREGIDA`), con el valor
  anterior de cada campo. Si ya estaba en SAFI, la nota añade que hay que
  corregir el CRM. Rechaza con 409 lo que la regla no admite y el cambio de
  categoría de un socio ya creado. Un reintento idéntico no deja un segundo
  registro. Si cambió un garante, llega su firma nueva y **sustituye** la
  anterior, que era de otra persona.
- La tableta la guarda **solo si el servidor la acepta**: sin conexión o con un
  rechazo, no cambia nada y lo dice. Así nunca muestra unos datos y el servidor
  otros.
- **Tu panel de SAFI no cambia**: vuelve a comprobar con los datos corregidos
  en cuanto la Jefatura lo abre de nuevo.

### 3. El oficial FAE del que depende un D-A o D-B

**Lo que pidió.** Que el D-A y el D-B solo avancen si el oficial del que
dependen es **Socio Activo o Fundador**, comprobado contra SAFI por su número,
desde la tableta en el momento y trayendo al menos su nombre y grado. Y que el
**grado, nombres y apellidos** de ese oficial vayan al **Parentesco** de la
ficha del D-A o D-B.

**Decisión del Coordinador:** si la tableta no puede consultar (sin red, SAFI
caído), **deja avanzar** y lo comprueba la bandeja antes del alta.

**Dónde está:**

- `DatosAfiliacion.oficialDependencia` (nuevo, nullable): lo que SAFI dijo de
  ese número —`VERIFICADO`, `NO_ENCONTRADO` o `NO_ES_ACTIVO_NI_FUNDADOR`—, con
  grado, nombres, apellidos y tipo. `validarTipo` no deja avanzar si SAFI ya dijo
  que no; sin verificar, sí.
- `AdaptadorSafi.consultarOficial(numero)` (nuevo, `adaptador.ts`): busca la
  ficha de **secuencia 00** de ese número en `Contacts` y compara su `cf_917` con
  `TIPO_SOCIO_SAFI.SA` / `.SF` («ACTIVO» / «FUNDADOR»). En MANUAL y en HTTP
  responde `consultado: false`, que **no es un «no»**.
- **`GET /api/safi/oficiales/:numero`** (área SOCIOS): lo que usa la tableta.
- `server/src/safi/oficial.ts` (nuevo) → `comprobarOficial()`: en el panel de
  SAFI y **antes del alta**. Si el CRM dice que no, aviso **bloqueante**
  (`COHERENCIA`); si no se pudo consultar, aviso que no bloquea, para comprobar
  a mano. Al dar de alta guarda al oficial en el trámite
  (`fijarOficialDependencia`).
- `registro.ts` → `parentescoDe()`: el Parentesco del D-A/D-B sale del oficial
  **tal como lo devolvió SAFI**, no de lo que alguien escribió; sin verificar, va
  **vacío** antes que equivocado. El de cónyuge, padres y juvenil, como antes.

---

## Lo que probé, y lo que no pude

El banco de siempre —la tableta en Node contra `server/dist`, base nueva,
`SAFI_MODO=MANUAL`—: **30 comprobaciones de esta ronda, todas en verde**, y las
**39 anteriores siguen en verde**. Además, el generador de formularios compone
los tres tipos de trámite sin cambios de maqueta.

Cubre: la hora del Ecuador (una marca de las 00:30 UTC sale «19:30» del día
anterior); la corrección antes del alta, repetida, sin enviar todavía, en curso
en SAFI (rechazada en los dos lados) y devuelta al Área de Socios (admitida con
aviso, sin cambiar la categoría); los tres recorridos de devolución, con la
bandeja de Contabilidad mostrando «Revisar de nuevo» y el FC guardado; las
observaciones del reverso con fecha y hora; la validación del oficial; el
Parentesco con el oficial verificado y vacío sin él; y el aviso no bloqueante
del panel en MANUAL.

**Lo que no pude probar, porque exige el CRM real: la consulta
`consultarOficial` contra SAFI.** El SQL sigue el patrón de `fichasDeNumero`,
pero hay que confirmarlo.

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

El diff debe mostrar cambios en `server/`, `web/` y `src/domain/`, **no** en
`src/services/formularios/`. Léete las piezas nuevas —sobre todo
`corregirSolicitud`, la rama nueva de `devolver` y `oficial.ts`— y, si algo no te
convence, dilo antes de desplegar. Respalda y reconstruye como de costumbre.

## Tarea 2 — Probar la consulta del oficial contra SAFI (solo lectura)

Con la imagen nueva y la sesión de `socios`, llama a
`GET /api/safi/oficiales/<número>` con:

1. el número de un **Socio Activo** real → `VERIFICADO`, con su grado (`cf_953`),
   nombres y apellidos;
2. el de un **Fundador** real → `VERIFICADO`;
3. el de un socio de **otra categoría** (un particular, por ejemplo) →
   `NO_ES_ACTIVO_NI_FUNDADOR`, con su tipo tal como lo guarda `cf_917`;
4. un número que **no exista** → `NO_ENCONTRADO`.

Confirma en el CRM tres supuestos del código: que la ficha del titular tiene
**secuencia `00`**, que los valores de `cf_917` son exactamente **«ACTIVO»** y
**«FUNDADOR»**, y que el grado vive en **`cf_953`**. Si alguno falla, corrígelo
tú en `adaptador.ts` y dilo.

**No hagas un alta de prueba** para ver el Parentesco escrito: se verá en la
prueba real, con un D-A acordado con el Coordinador.

## Tarea 3 — Vaciar la base para la prueba real

Pedido expreso del Coordinador: **borrar todos los datos del sistema, salvo los
tres usuarios**. Esta vez **también sus firmas** («Mi firma»): cada funcionario
volverá a cargarla en la prueba.

Con respaldo previo y el contenedor detenido:

- **Base:** trámites, adjuntos, archivos del expediente, incidencias, bitácora
  y sesiones. En `usuarios`, conservar las filas y poner `firma_en` a `NULL`.
- **Disco:** `/datos/firmas`, `/datos/tramites` y las carpetas de
  `/srv/campina/datos/expedientes`, y la carpeta compartida de escaneos, igual
  que en la limpieza del 12/09: vacías, conservando `_ARCHIVADOS` y `_REVISAR`.
- **No tocar:** SAFI, GLPI, `server/.env`, los respaldos.

Al levantar, comprueba que la base arranca en esquema vigente, que el siguiente
trámite será `AF-2026-0001` y que los tres usuarios entran. Las sesiones
borradas obligan a la tableta y a los tres navegadores a iniciar sesión otra
vez: avísale al Coordinador.

---

## Lo que queda pendiente y no es de esta ronda

- **Firma One Shot:** el Club está cotizando con **varios proveedores** y
  coordinando demostraciones. Alcance: solicitante y garantes; los tres
  funcionarios, opcional (firma propia de larga duración, o un visto «revisado»,
  como propuso la Jefatura). **No se cambia nada del sistema mientras tanto.**
  El seguimiento se lleva en el equipo de desarrollo (`docs/integraciones/`,
  fuera de esta rama).
- **SNIC (DIGERCIC):** en espera de que se decida **CampiñaAccess** (control de
  accesos, parqueadero y app móvil, en lugar del sistema de accesos actual).
- La lista formal de documentos por tipo de socio; `CORRESPONSAL A` en
  `cf_917`; la cuenta de Samba de la Jefatura.

## Lo que debes entregar al final

Un informe corto, en español, con:

1. Tu revisión de las piezas nuevas y si cambiaste algo.
2. El resultado de las cuatro consultas de la tarea 2 y de los tres supuestos
   del CRM.
3. La reconstrucción y el vaciado: nombres de los respaldos, qué quedó y qué se
   borró, y que el sistema arrancó en limpio.
4. Lo que quedó pendiente y de quién depende.
