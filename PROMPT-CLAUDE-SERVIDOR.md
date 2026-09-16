# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código.
>
> Escrito el **16/09/2026 por la tarde**, en respuesta a tu encargo corto de esa
> mañana (la fuerza fija del activo y del fundador). La versión anterior de este
> archivo sigue en el historial de la rama.
>
> Cópielo entero como primer mensaje de esa sesión.

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE — Club La Campiña.
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema vive en `/opt/campina-socios` (contenedor `campina-socios`) con sus
datos en `/srv/campina`.

**Esta ronda no toca nada que vaya dentro de la imagen.** Solo cambia la
aplicación de la tableta (`app/` y `src/features/`), así que **no hay imagen que
reconstruir** y no hay nada que comprobar en la base. Lo único que te queda es la
comprobación de «Mi firma» que dejaste pendiente, cuando el Coordinador instale
la compilación nueva.

## Reglas de esta sesión

1. **No borres nada sin preguntar.** Ni archivos de `/srv/campina`, ni filas de
   la base, ni registros de SAFI.
2. **SAFI tiene la escritura habilitada** y es el CRM real del Club. Nada de
   esta ronda escribe en él.
3. **GLPI no se toca.**
4. **Respalda antes de cambiar**, si llegaras a cambiar algo.
5. Informa en español, en lenguaje llano.

---

## Lo que se hizo en la tableta

En el paso «Ocupación e información institucional», cuando
`fuerzaFijaPara(datos.tipoMiembro)` no es `null` —Socio Activo y Fundador—:

- la fuerza se **muestra**, no se elige: un renglón «Fuerza · Fuerza Aérea» con
  la línea «Los socios activos y fundadores son oficiales de la Fuerza Aérea
  Ecuatoriana: su fuerza no se elige». Es el mismo tratamiento que ya tenía el
  vínculo con el socio titular, que también lo fija la categoría;
- `datos.fuerza` queda con ese valor, así que el formulario, la revisión y lo
  que viaja al servidor dicen lo mismo;
- al cambiar de categoría, si la anterior tenía fuerza fija y la nueva no, la
  fuerza se **vacía**: un corresponsal no hereda la Aérea sin que nadie se la
  haya preguntado. Entre dos categorías sin fuerza fija (CB → CC) se conserva lo
  que el operador haya elegido.

Los corresponsales B y C siguen con su selector, obligatorio.

## Lo que probé

El mismo banco de siempre —código real de la tableta en Node contra
`server/dist` recién compilado, base nueva, `SAFI_MODO=MANUAL`—: **29
comprobaciones, todas en verde**. Las nuevas:

- `fuerzaFijaPara`: «Aérea» en SA y SF, `null` en CB.
- La validación **rechaza** otra fuerza en esas categorías («En esta categoría
  la fuerza es siempre la Aérea») y **no la exige** si viene vacía.
- Al corresponsal sí se le exige declararla.
- Un trámite que llega con «Naval» en un Socio Activo: **el servidor guarda
  «Aérea»**. Tu `depurarEntrante` hace lo que dice.

Un detalle de ese último caso, por si alguna vez importa: la copia de la
**tableta** conserva lo que ella envió («Naval»), porque el avance que trae de
vuelta son las constancias y el expediente, nunca los datos del solicitante. Hoy
es inalcanzable —la tableta ya no deja elegir otra— y no me parece motivo para
tocar la sincronización; lo anoto porque si algún día el servidor corrige otro
dato del solicitante, la tableta no se enteraría.

## Sobre tu aviso C

«Mi firma» sigue pidiendo `GET /api/mi-firma` después de entrar, aunque
`POST /api/sesion` ya devuelva `firmaCargada`. No es por no haberlo visto: la
pantalla muestra **desde cuándo** está cargada la firma, y esa fecha solo la da
`/api/mi-firma`. Es una petición, al entrar, contra el servidor de la LAN.

---

## Tarea única — Actualizar la copia del repositorio

```bash
cd /opt/campina-socios
sudo git fetch origin
sudo git status
sudo git log --oneline -3 origin/despliegue-servidor
sudo git pull origin despliegue-servidor
sudo git diff --stat ORIG_HEAD HEAD -- server web src/domain src/services/formularios
```

**El último comando debe salir vacío.** Si mostrara algo, detente y dilo antes
de reconstruir.

## Y cuando el Coordinador instale la compilación

Lo que quedó pendiente de la ronda anterior, tal cual:

1. Tableta → **«Mi firma»** con los tres usuarios, cerrando la sesión prestada y
   volviendo a la de `socios` al terminar.
2. En el servidor, sin borrar nada: `ls -l /datos/firmas`, `firma_en` de los
   tres usuarios y los `CARGAR_FIRMA_FUNCIONARIO` de la bitácora.
3. En la primera afiliación que recorra las tres áreas, el reverso del
   formulario final con **las tres constancias firmadas**.
4. En esa misma afiliación, si es Socio Activo: la ficha en SAFI con **Fuerza
   Aérea** y el R-PGS1-1 impreso **sin** el recuadro de fuerza, como el papel.

## Lo que sigue pendiente y no es de esta ronda

- La lista formal de documentos por tipo de socio.
- `CORRESPONSAL A` en la lista `cf_917` de SAFI.
- La cuenta de Samba de la Jefatura de Socios.

## Lo que debes entregar al final

Un informe corto, en español: que el `git diff` salió vacío, el resultado de las
cuatro comprobaciones de arriba cuando la tableta esté al día, y lo que quede
pendiente y de quién depende.
