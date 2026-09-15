# El trámite de afiliación, de principio a fin

> Guía de operación del sistema de afiliación de socios del Club Social y
> Deportivo de Oficiales de la FAE — Club La Campiña. Escrita el 12/09/2026,
> sobre el ambiente limpio con el CRM de SAFI en modo **API** y **escritura
> habilitada**.
>
> Intervienen tres áreas y una tableta. Cada paso dice **quién** lo hace,
> **dónde** y **qué tiene que ver en pantalla** para saber que salió bien.

## Quién es quién

| Área | Usuario | Funcionario | Qué hace |
|---|---|---|---|
| Área de Socios | `socios` | MICHELLE DONOSO | Registra la afiliación en la tableta, crea al socio en SAFI, escanea la documentación |
| Contabilidad | `contabilidad` | MARITZA RAURA | Revisa el ingreso y registra la factura |
| Gerencia | `gerencia` | Crnl. S.P. EDGAR MUÑOZ | Aprueba el ingreso |

El nombre del funcionario se **congela** en el trámite en el momento de cada
acción: es el que se imprime en el reverso del formulario. Cambiarlo después no
reescribe las constancias ya emitidas.

- Bandeja de tareas: **http://soporte.clublacampina.com.ec:8080** (solo LAN).
- Tableta: la misma dirección en «Configuración y envío». Su sesión dura 30 días.

## El recorrido en una línea

```
Tableta ──► [Socios] Crear en SAFI ──► [Contabilidad] Revisar ──► [Gerencia] Aprobar ──► expediente completo
                                              │                        │
                                              └──── Devolver ◄─────────┘
                                                       │
                                          [Socios] Atender y reenviar, o anular
```

Los estados por los que pasa el trámite: `REGISTRADA` → `REVISADA` →
`APROBADA`. Una devolución lo deja en `OBSERVADA`; una anulación, en
`RECHAZADA`.

---

## Paso 1 · La tableta, con el socio delante

**Quién:** el Área de Socios, en la tableta. **Pantalla:** «Nueva afiliación».

Diez pasos, con validación en cada uno: identificación, tipo de socio, datos
personales, contacto, datos laborales, familia, garantes, fotografía,
compromiso y consentimiento. El asistente no deja avanzar sin lo obligatorio;
en particular, **no se puede terminar sin la firma del solicitante**.

Lo que la tableta captura y el servidor necesita aparte del formulario:

- **la firma del solicitante** trazada en pantalla (y la de cada garante que el
  tipo de socio exija),
- **la fotografía tipo carnet**.

Al terminar debe decir **«Afiliación registrada y enviada»**. Si dijera
«registrada» y nada más, quedó en la tableta: abra «Configuración y envío» y
pulse **«Sincronizar ahora»**. Si dijera **«Afiliación enviada, pero
incompleta»**, la firma o la fotografía no quedaron en la tableta: vuelva a
capturarlas desde la solicitud antes de que el socio se retire.

> **Ojo con esto.** La firma y la fotografía viven en el almacenamiento privado
> de la aplicación y viajan aparte del formulario. Si se reinstala la aplicación
> o se borran sus datos entre la captura y el envío, el formulario llega y las
> imágenes no: el trámite aparece en la bandeja con **«Faltan archivos de la
> tableta»**. Desde el 12/09/2026 eso ya no bloquea el trámite (ver paso 2 bis),
> y desde el 15/09/2026 **la tableta tampoco lo calla**: el portal dice
> «N trámites necesitan su atención», la solicitud dice qué archivo falta y
> ofrece volver a capturarlo, y la tableta deja de reintentar lo que ya no
> tiene.

**Cómo se comprueba:** el trámite aparece en la bandeja del Área de Socios con
su código `AF-2026-####`.

---

## Paso 2 · Área de Socios: crear al socio en SAFI

**Quién:** Área de Socios. **Dónde:** bandeja, pestaña **Pendientes**.
**Tarea:** «Crear en SAFI a …» (*Falta crear al socio en SAFI*).

Es lo primero que se hace, y va antes de Contabilidad a propósito: Contabilidad
revisa comprobando el ingreso en el CRM, así que para entonces la ficha ya tiene
que existir. Además, sin número de socio no hay nombre de carpeta para el
expediente ni nombre de archivo para los escaneos.

1. Pulse **«Confirmar y crear en SAFI»**. El panel:
   - lee del CRM las listas cerradas vigentes (membresía, suscripción, forma de
     pago, grupo de facturación, tipo de contribuyente y cuotas) — si el Club
     añadió un valor esta semana, aparece aquí sin tocar el código;
   - comprueba, **sin escribir nada**, que el número de socio esté libre, que la
     cédula no esté repetida y qué número toca según la secuencia;
   - en un dependiente, busca la Cuenta del titular y propone su ordinal.
2. Escriba el **número de socio** y revise lo propuesto. Los avisos en amarillo
   son cosas que el CRM no podría guardar o que conviene mirar dos veces.
3. Confirme. Con la escritura habilitada, el sistema **crea la Cuenta y la ficha
   de Socio** en SAFI y guarda sus identificadores en el expediente.

**Cómo se comprueba:** la tarea desaparece de Pendientes, el trámite pasa a
**Atendidas** del Área de Socios, y la afiliación aparece en **Pendientes de
Contabilidad**. En SAFI deben existir la Cuenta y el Socio con ese número.

> **Pendiente del lado del Club:** `CORRESPONSAL A` no existe todavía en la
> lista `cf_917` de SAFI, ni sus cuotas `480` y `40`. Hasta que se creen, un
> Corresponsal A no se puede dar de alta y el panel lo avisa.

### Paso 2 bis · Si faltan archivos de la tableta

La tarea **«Faltan archivos de la tableta»** dice exactamente qué no llegó y
ofrece dos salidas, ambas en la propia tarjeta:

- **«Subir el archivo»** — elija la imagen desde el equipo (la firma escaneada o
  recortada, la fotografía). Se guarda como si hubiera llegado de la tableta.
- **«Consta en papel: continuar sin él»** — pide un motivo de al menos diez
  caracteres, y queda en el expediente y en la bitácora con su nombre. El
  trámite continúa.

Antes de decidir, abra la solicitud en la tableta («Expediente digital»). Si el
archivo sigue allí, llega solo con «Enviar ahora». Si ya no está, la tarjeta
«Envío al servidor del Club» lo dice y ofrece una tercera salida, la mejor
cuando la persona sigue presente:

- **«Volver a capturar la firma…»** o **«Volver a tomar la fotografía»** — la
  misma persona firma otra vez en el lienzo, o se toma la foto, y la tableta la
  envía en el acto. La tarea de la bandeja desaparece sola.

Lo que la Jefatura declare en la bandeja («Consta en papel») también llega a la
tableta: la solicitud lo muestra con el motivo y la tableta deja de avisar.

---

## Paso 3 · Contabilidad: revisar el ingreso

**Quién:** Contabilidad. **Dónde:** bandeja, pestaña **Pendientes**.
**Tarea:** «Revisar la afiliación AF-2026-####».

Antes de que el Área de Socios cree al socio en SAFI, Contabilidad ve la
afiliación en la pestaña **En camino**, sin acciones: sirve para distinguir «no
hay nada» de «algo se quedó atascado antes de llegarme».

1. **«Ver expediente»**: el formulario completo en pantalla —R-PGS1-1, hoja de
   solicitud, carta de compromiso y reverso—, **con la firma** del solicitante.
2. Compruebe el ingreso en SAFI.
3. **«Marcar como revisada»**, con el número de factura si la afiliación genera
   comprobante.
4. O **«Devolver con observación»** (mínimo diez caracteres): el trámite vuelve
   al Área de Socios como *Devuelta con observaciones*.

**Cómo se comprueba:** el trámite pasa a `REVISADA`, sale de Pendientes de
Contabilidad y entra en **Pendientes de Gerencia**.

---

## Paso 4 · Gerencia: aprobar el ingreso

**Quién:** Gerencia. **Dónde:** bandeja, pestaña **Pendientes**.
**Tarea:** «Aprobar el ingreso AF-2026-####».

1. **«Ver expediente»** y, si Contabilidad dejó observación, léala en la tarjeta.
2. **«Aprobar el ingreso»**, o devolver con observación.

Al aprobar, el servidor hace dos cosas **por su cuenta**, sin hacer esperar a la
Gerencia:

- imprime el **formulario final en PDF** con las tres constancias (registro,
  revisión y aprobación, cada una con su funcionario y su fecha) y lo archiva en
  `/srv/campina/datos/expedientes/<número> <nombre>/`;
- **publica el expediente** en la sección Documentos de la Cuenta del socio en
  SAFI.

Si alguna de las dos falla, no se pierde: aparece en la bandeja del Área de
Socios como «Falta archivar el formulario final» o «Pendiente de cargar al CRM
de SAFI», cada una con su botón para reintentar.

**Cómo se comprueba:** el trámite queda `APROBADA` y en **Atendidas** de
Gerencia; en la carpeta del expediente están el formulario final en PDF y la
fotografía.

---

## Paso 5 · Área de Socios: la documentación física

**Quién:** Área de Socios. **Tarea:** «Falta escanear documentación de …».

La tarea aparece **en cuanto el trámite tiene número de socio** y muestra el
**nombre exacto** que debe llevar cada archivo. No aparece antes porque sin
número no hay nombre que la Jefatura pueda usar.

Dos formas de entregarlo, las dos válidas:

1. **Carpeta compartida de Samba** (`\\192.168.2.185\escaneos-socios`, usuario
   `joel`): deposite el archivo con el nombre exacto. El servidor la recorre cada
   30 segundos; «Revisar la carpeta ahora» no espera.
2. **«Subir el escaneo»** desde la propia tarjeta de la bandeja, si Samba no
   está a mano.

Y si un documento no aplica: **«No aplica a este trámite»**, con su motivo.

El formulario y la carta de compromiso **no se escanean**: los genera el sistema
con las firmas de la tableta.

### Dónde termina cada archivo de la carpeta compartida

| Situación | Destino | Qué ve en la bandeja |
|---|---|---|
| Nombre reconocido y trámite existente | se archiva en el expediente y el original pasa a `_ARCHIVADOS/<socio>/` con la fecha | la tarea desaparece |
| Nombre correcto, número sin trámite todavía | **se queda donde está** | «Archivo en espera de su trámite» → *Asignar a un trámite…* o *Apartar a _REVISAR* |
| Nombre ambiguo o que no corresponde a la persona | `_REVISAR/` | «Archivo no reconocido» → *Ya lo renombré: revisar*, *Asignar a un trámite…* o *Dar por resuelto* |

**Nunca se borra nada de la carpeta compartida.** Ante la duda, el sistema se
detiene y avisa: un documento en el expediente de otro socio es un incidente de
protección de datos.

---

## Paso 6 · Cierre

- **Número de tarjeta**: se registra desde el expediente cuando se emite la
  credencial.
- El expediente del socio queda en tres vistas: la carpeta del repositorio, el
  compartido de Samba en solo lectura (`expedientes-socios`) y la sección
  Documentos de su Cuenta en SAFI.

---

## Ninguna tarea se queda sin salida

Cada tipo de tarea declara en el código **al menos una** forma de resolverse, y
el tipo de datos lo obliga: no se puede añadir un tipo nuevo sin decir cómo se
cierra. La bandeja dibuja un botón por cada salida.

| Tarea | Área | Salidas |
|---|---|---|
| Falta crear al socio en SAFI | Socios | Confirmar y crear en SAFI · Anular el trámite |
| Faltan archivos de la tableta | Socios | Subir el archivo · Consta en papel: continuar sin él |
| Falta escanear documentación | Socios | Subir el escaneo · No aplica a este trámite · Revisar la carpeta ahora |
| Archivo en espera de su trámite | Socios | Asignar a un trámite… · Apartar a _REVISAR · Dar por resuelto |
| Archivo no reconocido | Socios | Ya lo renombré: revisar · Asignar a un trámite… · Dar por resuelto |
| Falta archivar el formulario final | Socios | Generar y archivar el formulario |
| Pendiente de cargar al CRM de SAFI | Socios | Reintentar la carga · Ya los cargué a mano |
| Devuelta con observaciones | Socios | Atender y reenviar · Anular el trámite |
| Pendiente de revisión | Contabilidad | Marcar como revisada · Devolver con observación |
| Pendiente de aprobación | Gerencia | Aprobar el ingreso · Devolver con observación |

Cada tarjeta lleva además una línea en imperativo con **qué debe hacer** quien la
recibe, y la antigüedad de la tarea (en rojo a partir del tercer día).

Las tareas de archivos sueltos no pertenecen a ningún trámite, así que al
resolverse **desaparecen** en lugar de pasar a Atendidas; el aviso lo confirma y
queda constancia en la bitácora.

---

## Prueba en limpio: lista de comprobación

Ambiente del 12/09/2026: base a cero (solo los tres usuarios), carpetas vacías,
SAFI en API con escritura habilitada.

1. [ ] **Dejar la tableta en limpio antes de abrir la aplicación contra este
       servidor.** Con la versión de la aplicación del 15/09/2026:
       «Configuración y envío» → **«Borrar los datos de prueba»** (se escribe
       BORRAR para confirmar; conserva la dirección del servidor y la sesión).
       Con una versión anterior, borrar los datos de la aplicación desde los
       ajustes de Android **antes** de abrirla: esa versión, ante una base
       vaciada, no da error sino que **vuelve a registrar sola cada trámite
       viejo como uno nuevo**, en un par de minutos. La versión del 15/09
       ya no lo hace: aparta esos trámites y pregunta.
2. [ ] Entrar a la bandeja con los tres usuarios (la limpieza cerró todas las
       sesiones).
3. [ ] Tableta: **Nueva afiliación** completa, con firma y fotografía →
       «registrada y enviada».
4. [ ] Bandeja de Socios: aparece `AF-2026-0001` y **no** hay tarea de «faltan
       archivos» (si la hay, la firma o la foto no llegaron: revisar antes de
       seguir).
5. [ ] Crear en SAFI con el número de socio acordado. Comprobar en el CRM la
       Cuenta y la ficha.
6. [ ] Contabilidad: «En camino» primero, «Pendientes» después de crearlo en
       SAFI. Ver expediente **con la firma**. Marcar revisada.
7. [ ] Gerencia: aprobar.
8. [ ] Expediente: formulario final en PDF + fotografía en
       `/srv/campina/datos/expedientes/<número> <nombre>/`.
9. [ ] Escaneo de cédula con el nombre exacto en la carpeta compartida →
       archivado y original en `_ARCHIVADOS`.
10. [ ] SAFI: el expediente publicado en Documentos de la Cuenta.
11. [ ] Probar una devolución: Contabilidad devuelve con observación, Socios
        atiende y reenvía.

---

## Cuando algo no cuadra

| Síntoma | Dónde mirar |
|---|---|
| La tableta no envía | «Configuración y envío» → Sincronizar ahora. Si dice que no hay una sesión válida, iniciar sesión otra vez con el usuario del Área de Socios |
| La tableta dice «N trámites necesitan su atención» | «Configuración y envío» los lista. Cada solicitud dice qué pasa: un archivo que ya no está en la tableta (volver a capturarlo, o subirlo o declararlo en papel desde la bandeja) o un envío que el servidor rechazó |
| La tableta dice «el servidor ya no tiene este trámite» | La base del servidor se vació o se restauró. Desde la solicitud: «Volver a enviar al servidor» (entra como trámite nuevo, con otro código) o eliminarla de la tableta si era de prueba. La tableta no lo reenvía por su cuenta |
| Una afiliación no llega a Contabilidad | ¿Está creado el socio en SAFI? Es la condición para que aparezca su tarea |
| El expediente no se publica en SAFI | Bandeja de Socios → «Reintentar la carga». El mensaje del CRM viene tal cual |
| Un escaneo no se archiva | Pestaña «Cómo escanear» → «Comprobar un nombre antes de escanear» |
| Dudas sobre el CRM | Pestaña «Cómo escanear» → «Comprobar la conexión». No crea nada |
| Estado del servicio | `curl http://127.0.0.1:8080/api/salud` |
| Respaldos | `/home/joel/glpi_backups/campina_*` — diario a la 01:30, tres copias |
