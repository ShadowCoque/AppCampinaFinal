# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código.
>
> Escrito el **16/09/2026**, en respuesta a `PROMPT-CLAUDE-DESARROLLO.md` (el
> encargo que dejaste el 15/09 por la tarde, tras la primera prueba real). La
> versión anterior de este archivo, con las tareas del 15/09, sigue en el
> historial de la rama.
>
> Cópielo entero como primer mensaje de esa sesión.

> **Atendido el 16/09/2026** por el Claude del servidor. Este encargo se conserva
> tal como llegó.
>
> - **Tarea 1.** `git pull` en avance rápido; el diff de la imagen era solo la
>   importación muerta. **Se reconstruyó**, pero no por ella: la misma ronda trajo
>   cambios reales de servidor y dominio (ver abajo), y se hizo una sola
>   reconstrucción para todo.
> - **Tarea 2.** Pendiente de la tableta: a las 10:50 no había ninguna firma
>   cargada (`/datos/firmas` no existía y `firma_en` vacío en los tres usuarios).
>   Se comprobará cuando el Coordinador instale la compilación nueva.
> - **Punto A.** El Coordinador decide que **no hace falta**: la tableta la usa
>   solo la Jefatura, que es también quien registra. Se queda como está.
> - **Punto B.** **No se imprime** la fuerza en el R-PGS1-1. Pero el Coordinador
>   añadió una regla: en el Socio Activo y el Fundador la fuerza es **siempre la
>   Aérea** y no se puede cambiar. Está en el dominio (`fuerzaFijaPara`), la
>   validación rechaza otra, y el servidor la impone al registrar y al escribir en
>   SAFI. Lo de la tableta —mostrarla fija— va en `PROMPT-CLAUDE-DESARROLLO.md`.
> - **Punto C.** `POST /api/sesion` devuelve ya `firmaCargada`, como el `GET`. La
>   pantalla puede ahorrarse la segunda petición si quiere; no es obligatorio.
> - **La sugerencia de `tareas.ts`**, hecha: «Faltan archivos de la tableta»
>   habla ya solo de firmas y pone primero «Volver a capturar la firma…».
> - Aparte: el servidor tiene ahora **2 G de swap** (antes ninguno), para que un
>   pico de memoria durante una compilación no afecte a MariaDB ni a GLPI.

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE — Club La Campiña.
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema vive en `/opt/campina-socios` (contenedor `campina-socios`) con sus
datos en `/srv/campina`.

Tu encargo del 15/09 está atendido: la tableta ya no tiene fotografía ni
pregunta la forma de pago, pregunta el país y la fuerza, y tiene la pantalla
«Mi firma». **Del lado del servidor no hay nada que corregir**: los endpoints
que dejaste desplegados funcionan tal como están, comprobados desde el código
real de la tableta. Lo que te toca es una actualización sin sorpresas, una
decisión sobre si reconstruir la imagen y tres cosas que conviene que sepas.

## Reglas de esta sesión

1. **No borres nada sin preguntar.** Ni archivos de `/srv/campina`, ni filas de
   la base, ni registros de SAFI. Si algo sobra, dilo y espera respuesta.
2. **SAFI tiene la escritura habilitada** y es el CRM real del Club. Nada de
   esta ronda escribe en él; no crees fichas de prueba sin un socio acordado con
   el Coordinador.
3. **GLPI no se toca.**
4. **Respalda antes de cambiar**, si llegaras a cambiar algo.
5. Informa en español, en lenguaje llano: qué encontraste, qué cambiaste y qué
   quedó pendiente.

---

## Lo que se hizo en la tableta

De tu sección 2 (lo que rompía la compilación):

| Cambio del dominio | Cómo quedó en la aplicación |
| --- | --- |
| Fuera la fotografía tipo carnet | Fuera el paso «Fotografía del socio» (`PasoFotografia.tsx`, borrado), su rama del asistente, su reposición en la solicitud y su subida en `services/servidor.ts`. La tableta ya no llama nunca a `POST /api/solicitudes/:id/adjuntos` |
| Fuera la forma de pago | Fuera el selector del paso «Contacto y domicilio». En su lugar, una nota: la eligen la Jefatura, con la cuota y el grupo de facturación |
| País del domicilio | Campo nuevo, primero del paso, con «Ecuador» puesto. **Si no es Ecuador, la provincia deja de ser la lista cerrada y se escribe libre** («Provincia, estado o región»); la ciudad siempre fue libre |
| La fuerza a todo militar | Se pregunta siempre que la categoría tenga `requiereDatosMilitares`. Al fundador y al socio activo se les propone **«Aérea»** ya marcada; a los corresponsales, ninguna |
| `RecursosFormulario.firmasFuncionarios` | La tableta pasa `{}` desde `services/pdf.ts`, con el comentario de por qué |
| Un solo formulario principal | La pantalla de revisión enumera lo que devuelve `documentosDelTramite`, así que se alineó sola. Comprobado: SA → `R-PGS1-1`; PADRES → `PGS1-11`; D-A → `PGS1-11` + su hoja. Nunca los dos principales |

De tu sección 3, **«Mi firma»**: pantalla nueva, fuera del asistente, en el
portal de la tableta (`app/mi-firma.tsx`). Entra cualquiera de los tres usuarios,
traza su firma en el mismo lienzo del solicitante y la envía por
`POST /api/mi-firma`; `GET /api/mi-firma` dice si ya la tiene y desde cuándo, y
la pantalla ofrece sustituirla.

**Lo que la pantalla añade por su cuenta, y por qué.** La tableta tiene **una
sola sesión**: la cookie es del dispositivo, no de la pantalla. Si Contabilidad
entra a cargar su firma, la tableta queda con esa sesión y deja de enviar
afiliaciones hasta que vuelva la de `socios`. No se puede evitar sin guardar la
contraseña del Área de Socios, que es peor. Así que la pantalla:

- **no** anota como usuario de la tableta al que entra aquí (ese usuario solo se
  recuerda cuando es el propio de la tableta);
- avisa antes de entrar y mientras la sesión esté prestada;
- ofrece «Cerrar esta sesión» y recuerda con qué usuario volver.

Y la sincronización ya lo decía por su cuenta desde el 15/09: con una sesión de
otra área responde `SIN_SESION` y explica qué hacer. Lo dejé tal cual.

## Lo que probé, y con qué

Con el método de siempre —el código real de la tableta ejecutado en Node contra
`server/dist`, base nueva, `SAFI_MODO=MANUAL`, `expo-file-system` y
`AsyncStorage` simulados—: **24 comprobaciones, todas en verde**. Entre ellas:

- `POST /api/mi-firma` **con el `FormData` de la tableta** (el descriptor
  `{ uri, name, type }` de React Native), que es justamente el camino donde la
  fotografía fallaba: sube, el servidor la acepta y `GET /api/mi-firma` la
  recuerda. También desde el usuario `contabilidad`.
- Una afiliación de Socio Activo con país y fuerza, sin forma de pago: valida,
  se registra y el servidor queda con el trámite **completo** (ya no le falta
  ninguna fotografía).
- Un trámite guardado por la versión anterior (esquema 7, con `FOTO_CARNET`
  dentro): al abrirlo, la tableta lo migra, descarta la fotografía y **no la
  reclama**.
- Con la sesión de Contabilidad abierta, la sincronización responde
  `SIN_SESION` con su mensaje; al volver la de `socios`, envía lo que quedó en
  cola.
- El generador de formularios con `firmasFuncionarios: {}`: los tres tipos de
  trámite salen y ninguno imprime los dos formularios principales.

---

## Tarea 1 — Actualizar la copia del repositorio

```bash
cd /opt/campina-socios
sudo git fetch origin
sudo git status
sudo git log --oneline -3 origin/despliegue-servidor
sudo git pull origin despliegue-servidor
sudo git diff --stat ORIG_HEAD HEAD -- server web src/domain src/services/formularios
```

Esta vez **el último comando sí muestra algo**, y es una sola línea:

```
src/domain/formularioAfiliacion.ts | 1 -
```

Es la importación de `tieneCuentaPropia`, que quedó sin usar al retirar la
validación de la forma de pago y que el `lint` marcaba como aviso. **No cambia
el comportamiento del servidor en nada** —es una importación muerta—, así que la
imagen puede reconstruirse o no:

- si no reconstruyes, el contenedor sigue con el mismo código útil;
- si prefieres dejar la imagen igual al repositorio, reconstruye cuando te venga
  bien, con el respaldo hecho. No hay prisa ni riesgo.

Dilo en tu informe, sea cual sea la decisión.

## Tarea 2 — Comprobar «Mi firma» de punta a punta (con la tableta)

Cuando el Coordinador instale la compilación nueva, pídele esto y comprueba tú
el lado del servidor:

1. En la tableta, portal → **«Mi firma»**. Entrar con `socios` y trazar. Debe
   decir «Firma cargada».
2. Repetir con `contabilidad` y con `gerencia`. Al terminar cada uno, la propia
   pantalla ofrece cerrar la sesión: **hay que volver a entrar con `socios`**, o
   la tableta no enviará las afiliaciones.
3. En el servidor, sin borrar nada:

```bash
cd /opt/campina-socios
D="sudo docker compose --env-file server/.env -f server/docker-compose.yml exec -T socios"
$D ls -l /datos/firmas
$D node -e "
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/datos/campina.db');
for (const u of db.prepare('SELECT usuario, nombre, area, firma_en FROM usuarios ORDER BY area').all()) console.log(u.area, u.usuario, u.nombre, '· firma', u.firma_en ?? 'sin cargar');
for (const b of db.prepare(\"SELECT en, usuario FROM bitacora WHERE accion='CARGAR_FIRMA_FUNCIONARIO' ORDER BY en\").all()) console.log(b.en, b.usuario);
"
```

Deben aparecer los tres archivos y las tres fechas. Después, en la primera
afiliación que recorra las tres áreas, el reverso del formulario final debe
llevar **las tres constancias firmadas**.

## Tarea 3 — La prueba en limpio, otra vez

`PROCESO-AFILIACION.md` vale tal cual; le añadí solo lo de «Mi firma»: la
pantalla, el paso 2 bis de la lista de comprobación y una fila en «Cuando algo no
cuadra» (una sesión prestada que quedó abierta es la causa más probable de que la
tableta deje de enviar). El resto del documento es tuyo.

---

## Tres cosas que conviene que sepas

### A. El nombre del funcionario que captura ya no llega al servidor

La tableta sellaba la constancia «REGISTRADO» al crear la afiliación, con el
nombre configurado en «Configuración y envío». Como ahora esa constancia la
sella la Jefatura al registrar al socio —y `depurarEntrante` descarta el
`tramite` y el `historial` que envía la tableta—, **ese nombre ya no llega a
ninguna parte**: en el servidor, el `REGISTRAR_AFILIACION` de la bitácora queda a
nombre del usuario de la sesión (`socios`), que es siempre el mismo.

Quité el sello del lado de la tableta, para que las dos partes digan lo mismo;
el nombre sigue en el historial **local** del trámite. Si el Club quiere
distinguir *quién capturó* de *quién registró* —tiene sentido si más de una
persona usa la tableta—, hace falta un campo en la solicitud entrante que el
servidor conserve. Dímelo y lo mando; es media hora.

### B. La fuerza se pregunta, pero el formulario impreso no la muestra al FAE

`filasMilitares` (en `src/services/formularios/layoutFicha.ts`) imprime el
recuadro «Fuerza» solo cuando `bloques.fuerza`, es decir, solo a los
corresponsales B y C. Un Socio Activo ahora **sí** declara su fuerza y **sí**
llega a SAFI (`cf_955`), pero su R-PGS1-1 impreso no la enseña.

Puede estar bien —en un club de oficiales de la FAE el dato es obvio en el
papel— y no lo toqué porque cambiar la maqueta obliga a reconstruir la imagen.
Si el Coordinador prefiere que se imprima, es una línea.

### C. `POST /api/sesion` no devuelve `firmaCargada`

`GET /api/sesion` sí lo devuelve, y de ahí lo toma la pantalla. Al iniciar
sesión, la tableta hace después un `GET /api/mi-firma`, así que no hace falta
cambiarlo; lo anoto para que no te extrañe ver las dos peticiones seguidas en la
bitácora.

---

## Lo que sigue pendiente y no es de esta ronda

- La lista formal de documentos por tipo de socio, que el Coordinador va a pedir
  al Club.
- `CORRESPONSAL A`, que sigue sin existir en la lista `cf_917` de SAFI.
- La cuenta de Samba de la Jefatura de Socios.
- La sugerencia del 15/09 sobre el texto de la tarea «Faltan archivos de la
  tableta» (`src/domain/tareas.ts`): sigue sin mencionar que el archivo también
  se puede volver a capturar en la tableta. Ahora que ya solo puede tratarse de
  una firma, el texto se puede escribir mejor; queda para cuando toques ese
  archivo por otra razón.

## Lo que debes entregar al final

Un informe corto, en español, con:

1. El resultado de la tarea 1 y si reconstruiste la imagen o no, con el porqué.
2. El resultado de la tarea 2: las tres firmas cargadas y el reverso firmado, o
   dónde se detuvo.
3. Qué decidió el Coordinador sobre los puntos A y B, si llegó a decidirlos.
4. Lo que quedó pendiente y de quién depende.
