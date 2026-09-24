# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código.
>
> Escrito el **24/09/2026**, después de una prueba real del Coordinador. La
> versión anterior de este archivo, con su nota «Atendido el 23/09/2026», sigue
> en el historial de la rama.
>
> Cópielo entero como primer mensaje de esa sesión.

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE (Club La Campiña).
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema vive en `/opt/campina-socios` (contenedor `campina-socios`) con sus
datos en `/srv/campina`.

Gracias por cerrar el 8080 y por la nota: traje tus tres commits
(`d06f43a`, `f60ebac`, `d70c4f7`). Esta ronda tiene **una tarea que es solo
tuya y va primero**: averiguar por qué una afiliación real terminó con **dos
fichas de Socio en SAFI**. Después, reconstruir: cambian `src/domain/`,
`server/`, `web/` y `src/services/formularios/`.

## Reglas de esta sesión

1. **Respalda antes de reconstruir.**
2. **SAFI tiene la escritura habilitada** y es el CRM real. Para la tarea 1 se
   **lee**: no borres ni corrijas fichas sin que el Coordinador lo apruebe
   expresamente, ficha por ficha.
3. **GLPI no se toca**, ni el sitio de Apache.
4. **La base no se vacía.**
5. Informa en español, en lenguaje llano.

---

## Tarea 1 (la primera): el D-C de DENNIS ANDRADE y la ficha «Completar Aqui»

**Lo que contó el Coordinador**, casi textual:

> Registré a DENNIS ANDRADE como D-C. En la bandeja de la Jefatura, con todo
> llenado, pulsé «Registrar» (el panel de SAFI) y me dijo que la cédula estaba
> mal. **Sin cerrar ese panel**, corregí la cédula desde la tableta y guardé; la
> tableta dijo que la bandeja ya vería los cambios. Volví al panel, que seguía
> abierto, y pulsé el botón azul de crear. Terminé el trámite con Contabilidad y
> la Gerencia. Resultado: **en SAFI hay dos socios** para esta persona. El de
> más quedó con la categoría **«Completar Aqui»** y casi sin datos. No era la
> cónyuge (la del R-PGS1-25).

**Qué hay que averiguar**, en este orden:

1. **En la base y la bitácora:** el trámite (su código), su historial, las
   entradas de bitácora (`AFILIACION_CORREGIDA`, las del alta en SAFI) con sus
   horas, y en el expediente `cuentaSafiId`, `socioSafiId` y `altaSafiMensaje`.
   En el log del contenedor, cuántas veces se llamó a `POST
   /api/solicitudes/:id/safi` y qué respondió cada una.
2. **En SAFI, solo lectura:** la Cuenta y **todas** las fichas de Socio con ese
   número y con las dos cédulas (la mal escrita y la corregida): identificador,
   hora de creación, quién las creó (el usuario de la integración o una
   persona), `cf_917`, secuencia y qué campos traen.
3. **Tres hipótesis**, de la que más me convence a la que menos:
   - **SAFI crea solo una ficha de Socio al crear una Cuenta** (un *workflow*
     de vTiger en Cuentas), con la categoría por defecto «Completar Aqui» y casi
     vacía. Encaja con lo que viste el 17/09: el 2924 y el 2925 tenían fichas
     «Complete Aqui» que parecían hechas a mano. Si es así, **pasaría en cada
     titular** que creamos, y habría que desactivar ese *workflow* (decisión
     del Club) o que la integración use esa ficha en lugar de crear otra.
     Revísalo en Configuración, Flujos de trabajo (*Workflows*) del módulo
     Cuentas, y compara con las altas del 17/09 y del 19/09.
   - **El primer intento creó la Cuenta y falló en la ficha** (la cédula). El
     segundo reutilizó la Cuenta, como está previsto, pero **esa Cuenta
     conserva la cédula y el nombre de antes de la corrección**. Mira su C.I.
   - Un **doble envío** del panel (dos clics, o dos pestañas).
4. **Corrígelo en el código** si la causa está de nuestro lado, y dime qué
   quedó en SAFI y qué habría que arreglar a mano. **No borres nada en SAFI**:
   el Coordinador decide.

**Lo que ya puse del lado de desarrollo**, sin saber aún la causa:

- **Versión en el panel:** `GET /api/solicitudes/:id/safi` devuelve `version`
  (el `actualizadaEn` del trámite). La bandeja la manda al confirmar y, si el
  trámite cambió con el panel abierto (una corrección desde la tableta), el
  servidor responde **409 con `cambiado: true`**, no crea nada y la bandeja
  vuelve a abrir el panel con los datos vigentes. Un panel sin `version` sigue
  como antes.
- **Aviso de Cuenta reutilizada:** si un intento anterior dejó la Cuenta creada
  y la ficha no, el panel lo dice (sin detener): esa Cuenta conserva los datos
  de aquel intento y, si luego se corrigió la cédula o el nombre, hay que
  corregirlos también en el CRM.

Si tu causa es otra, dilo y cámbialo tú.

---

## Lo que cambió en esta ronda

Pedidos del Coordinador, con la Jefatura de Socios, el 24/09/2026.

| Dónde | Qué | ¿Reconstruir? |
| --- | --- | --- |
| `src/domain/sociosSafi.ts` | **Quién puede afiliar a quién.** La regla `TITULAR` se parte en tres: `TITULAR_CONYUGE` (Activo, Fundador, D-B casado, D-C, P-A, corresponsales y titular por traspaso), `TITULAR_JUVENIL` (los mismos **y el D-B soltero**) y `TITULAR_PADRES` (Activo, Fundador y titular por traspaso). **El D-A, el P-B y los suscriptores no afilian a nadie.** `avisoTraspaso()`: «CONYUGE Y PADRES TITULARES» solo mantiene el beneficio para la familia del socio fallecido; se avisa sin detener. `esOficial()` | **Sí** |
| `server/src/safi/referencias.ts` | Usa las reglas nuevas y añade el aviso del titular por traspaso | **Sí** |
| `server/src/safi/registro.ts` | `valorCuotaDe(confirmacion, categoría)`: con subscripción **Trimestral o Semestral**, el Valor Cuota es el del tarifario de esa periodicidad. `faltantesDeConfirmacion` no exige cuota anual ni mensual en esos casos | **Sí** |
| `server/src/http/api.ts` | El panel trae `tarifas` (por periodicidad) y `version`. El alta comprueba la versión y usa `valorCuotaDe` con la categoría. El aviso de Cuenta reutilizada | **Sí** |
| `web/` | **Subscripción que llena la cuota:** la lista ofrece solo las periodicidades de la categoría; Anual pone la cuota anual y vacía la mensual, Mensual al revés, Trimestral y Semestral vacían las dos y van al Valor Cuota. La reapertura del panel con el 409. Sin «;» ni rayas en los textos | **Sí** |
| `src/services/formularios/` | Solo separadores que añade el sistema: «QUITO, 12/04/2004» en lugar de «QUITO — 12/04/2004». Los textos de los originales, intactos | **Sí** |
| Tableta | Búsqueda por **número o cédula** en todos (garantes, titular, socio del que depende, abuelo), con búsqueda sola al completar la cédula y **vaciado de lo traído si se cambia la clave**. Grado y situación del titular solo si es oficial. Textos sin «;» ni rayas | No (tableta) |

**Probado** en `MANUAL`: **78 comprobaciones** de la ronda (entre ellas las
reglas nuevas, el 409 por versión, las tarifas del panel y el trimestral del
gimnasio) y las **69 anteriores**, todo en verde.

## Tarea 2: reconstruir y comprobar

```bash
cd /opt/campina-socios
sudo git fetch origin
sudo git pull origin despliegue-servidor
sudo git diff --stat ORIG_HEAD HEAD -- server web src/domain src/services/formularios
```

Respalda, reconstruye y comprueba en la bandeja, con un trámite de prueba si lo
hay: al elegir Subscripción Mensual se llena la cuota mensual y el Valor Cuota.

## Tarea 3: el trimestral y el semestral en SAFI (solo lectura)

SAFI solo tiene Cuota Anual (`cf_947`) y Cuota Mensual (`cf_949`). Para el
suscriptor de gimnasio (trimestral 130, semestral 250) y el de tenis (semestral
240) supuse que el importe va en el **Valor Cuota** de la Cuenta y las dos
cuotas a 0. **Mira fichas reales** con Subscripciones «Trimestral» o
«Semestral»: qué tienen en `cf_947`, `cf_949` y en el `cf_977` de su Cuenta. La
lista de cuotas anuales incluye un «130»: quizá el Club lo guarda ahí. Si es
distinto de lo que supuse, corrige `valorCuotaDe` y el `change` de la
subscripción en `bandeja.js`, y dilo.

---

## Lo que queda pendiente y no es de esta ronda

- **La tableta nueva** la compila e instala el Coordinador.
- Completar con `02` los convencionales de 7 dígitos: lo decide el Coordinador.
- TLS, `CORRESPONSAL A` en `cf_917`, la lista de documentos por tipo de socio y
  la firma One Shot, como estaban.

## Lo que debes entregar al final

Un informe corto, en español: **la causa de la doble ficha** y lo que hay en
SAFI; qué cambiaste; el respaldo y la reconstrucción; y lo que encontraste del
trimestral y el semestral.
