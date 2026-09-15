# Encargo para el Claude de desarrollo (aplicación móvil)

> Lo escribe el Claude que trabaja **en el servidor del Club**
> (`soporte.clublacampina.com.ec`, 192.168.2.185), el **15/09/2026 por la
> tarde**, después de la primera prueba real de extremo a extremo. Cópielo como
> primer mensaje de la sesión de desarrollo.
>
> El encargo anterior —el del 12/09, que usted atendió con `3d19a12`— está en el
> historial de la rama. Gracias por los dos hallazgos: los dos eran correctos y
> se comprobaron en la prueba.
>
> Antes de empezar: `git pull origin despliegue-servidor`. **El dominio
> compartido cambió bastante y la aplicación no compilará hasta que la ajuste.**

## 1. Qué pasó en la prueba real

El Coordinador afilió a una persona real (Socio Activo, número 2924), la pasó
por las tres áreas y la aprobó. Todo el circuito funcionó: alta en SAFI,
revisión, aprobación, formulario final en PDF, escaneos archivados y expediente
publicado en Documentos de la Cuenta del CRM. Después probó un «Padres».

De ahí salió una lista de correcciones. Las del servidor y la bandeja ya están
hechas (van en este mismo commit). **Lo que sigue es lo de la tableta.**

## 2. Lo que cambió en el dominio compartido

Todo esto ya está en `src/domain` y es lo que rompe la compilación de la
aplicación.

### `ESQUEMA_SOLICITUD` pasa de 7 a 8

`migrarSolicitud` pone el país por defecto y descarta la fotografía de los
trámites guardados. No hace falta que la aplicación haga nada más.

### La fotografía tipo carnet **ya no existe**

Decisión del Coordinador: se retira definitivamente. En la prueba, la tableta
decía no poder conectarse con el servidor **solo** al enviar la fotografía —la
firma subía bien por la misma sesión— y en los registros del servidor **no
consta ninguna petición de subida**: fallaba en el dispositivo antes de salir a
la red. Además la carnetización no la va a usar.

Desapareció de: `TIPOS_DOCUMENTO`, `REQUISITOS`, `requisitosPara`,
`ROLES_ADJUNTO`, `adjuntosEsperados`, el paso `fotografia` de `CLAVES_PASO` y su
validación. También se retiró `requisitosCapturables`, que ya solo servía para
ella.

**En la aplicación hay que quitar**: el paso «Fotografía del socio»
(`src/features/afiliacion/PasoFotografia.tsx` y su rama en `app/afiliacion.tsx`),
la reposición de la fotografía en `src/features/expediente/TarjetaEnvio.tsx`, y
las referencias en `src/data/solicitudes.ts` y `src/services/servidor.ts`. El
texto de `PasoTipo.tsx` menciona el paso «Fotografía»: también sobra.

El servidor rechaza ahora `FOTO_CARNET` con 400, así que una tableta sin
actualizar lo apartará con su mensaje, que es el comportamiento correcto.

Queda constancia de la funcionalidad en `docs/RETIRADO-fotografia-carnet.md`,
con lo que haría falta para retomarla en un futuro CampiñaAccess (fotografía +
biometría para control de accesos y parqueadero). No la borre del historial.

### La forma de pago **ya no se pregunta en la tableta**

La elige la Jefatura de Socios en su bandeja, al confirmar el registro, junto
con la cuota y el grupo de facturación. Se pedía en los dos sitios y ganaba la
de la bandeja: en la prueba la tableta guardó «débito bancario» y en SAFI quedó
«efectivo».

`datos.formaPago` **sigue existiendo** en el modelo (la usa el panel de la
bandeja), pero `validarContacto` ya no la exige. Quite el selector del paso
«Contacto y domicilio».

### El domicilio ahora tiene **país**

Campo nuevo `datos.pais`, obligatorio, con `PAIS_POR_DEFECTO` («Ecuador») ya
puesto. Viaja al «País (Factura)» de la ficha del Socio y de la Cuenta en SAFI,
que hasta ahora quedaban vacíos.

En la pantalla: país primero, y **si no es Ecuador, la provincia deja de ser la
lista cerrada `PROVINCIAS` y se escribe libre** (la lista es la del Ecuador). La
ciudad es libre siempre. Piense en un corresponsal diplomático.

### La **fuerza** se pregunta a todo militar

`validarLaboral` ahora exige `datos.fuerza` siempre que la categoría tenga
`requiereDatosMilitares` (fundador, activo y corresponsales B y C), no solo
cuando `requiereFuerza`. La ficha de un Socio Activo —oficial de la FAE— llegaba
a SAFI con «NO APLICA» porque nadie se lo preguntaba.

Sugerencia: en el Socio Activo y el Fundador, proponer «Aérea» ya marcada; son
oficiales de la FAE. En los corresponsales, sin preselección.

### Un solo formulario principal por categoría

Era el fallo que vio el Coordinador: un «Padres» generaba el R-PGS1-1 **y** el
PGS1-11.

- **R-PGS1-1**: solo el Socio Activo.
- **PGS1-11**: todas las demás categorías.
- Detrás, la hoja de solicitud propia de la categoría cuando la tiene, y la
  carta de compromiso cuando aplica. Los dependientes de un socio titular
  —cónyuge, padres, juvenil— y el fundador llevan **solo** el PGS1-11.

Funciones nuevas en `tiposMiembro.ts`: `formularioPrincipalPara(tipo)` y
`hojaAdicionalPara(tipo, estadoCivil)`. `documentosDelTramite` y
`construirFormulario` ya las usan; `hojaDe` cambió de significado. Si la
aplicación enumera en pantalla los documentos que se van a generar, se alinea
sola.

### `RecursosFormulario` tiene un campo más

`firmasFuncionarios: Partial<Record<Area, string | null>>`. Solo lo llena el
servidor, que es quien tiene los archivos; la tableta pasa `{}` y
`recursosVacios()` ya lo hace. Si la aplicación construye los recursos a mano,
añádalo.

## 3. Lo que hay que añadir en la tableta

### «Mi firma»: la firma de cada funcionario, una sola vez

Las constancias del reverso —REGISTRADO, REVISADO y APROBADO— llevan ahora la
firma del funcionario, además de su nombre. Decisión del Coordinador: **se
cargan desde la tableta, una sola vez, autenticándose con el usuario propio**, y
quien no la cargue sigue trabajando igual (su recuadro se imprime solo con el
nombre, como hasta ahora).

Hace falta una pantalla, fuera del asistente de afiliación, donde:

1. se inicie sesión con cualquiera de los tres usuarios (`socios`,
   `contabilidad`, `gerencia`) — **ojo**: la sincronización sigue exigiendo el
   área SOCIOS, esta pantalla no;
2. se trace la firma en el mismo lienzo que usa el solicitante;
3. se envíe, y se pueda volver a trazar cuando quiera.

Endpoints, ya desplegados:

| Método y ruta | Qué hace |
| --- | --- |
| `GET /api/mi-firma` | `{ cargada: boolean, en: string \| null }` del funcionario de la sesión |
| `POST /api/mi-firma` | Multipart con el archivo. PNG o JPG, máximo 2 MB. Sustituye la anterior |

`GET /api/sesion` devuelve además `firmaCargada`, por si quiere mostrarlo al
entrar.

La firma se **copia** al trámite en el momento de firmar, así que volver a
trazarla no reescribe constancias ya emitidas. Es la misma regla del nombre del
funcionario.

## 4. Lo que NO cambia

- La cadencia de sincronización y el manejo de rechazos del 15/09 quedan como
  están: funcionaron bien en la prueba.
- Las firmas del solicitante y de los garantes, igual.
- `server/.env`, el despliegue y SAFI: no se tocan desde desarrollo. **SAFI
  sigue con la escritura habilitada y es el CRM real del Club.**

## 5. Lo que queda pendiente y no es suyo

- El Coordinador va a pedir al Club la **lista formal de documentos por tipo de
  socio**. Hasta entonces, los requisitos documentales se quedan como están (la
  cédula sigue siendo obligatoria).
- `CORRESPONSAL A` sigue sin existir en la lista `cf_917` de SAFI.
- La cuenta de Samba de la Jefatura de Socios.

## 6. Cómo coordinamos

Rama `despliegue-servidor`, como siempre. Deje su nota «Atendido el …» al
principio de este archivo sin reescribir el encargo, y las tareas que me tocan a
mí en `PROMPT-CLAUDE-SERVIDOR.md`. Si un cambio suyo toca `server/`, `web/`,
`src/domain/` o `src/services/formularios/`, dígalo: eso obliga a reconstruir la
imagen del servidor.
