# Prompt para el Claude del servidor (despliegue a producción)

> Este archivo es el encargo que se le entrega al Claude que trabaja **en el
> servidor Ubuntu del Club** (`soporte.clublacampina.com.ec`, 192.168.2.185),
> donde están Docker, Samba y la red que alcanza al CRM de SAFI. El Claude de
> desarrollo (el del equipo de la Coordinación de TICs) no tiene acceso a nada
> de eso: su parte es el código.
>
> Escrito el **23/09/2026 por la tarde**, en respuesta a su `dc31657`. La
> versión anterior de este archivo —con su nota «Atendido el 23/09/2026», la de
> la tarea 2 contra el CRM y la del nombre nuevo— sigue en el historial de la
> rama.
>
> Cópielo entero como primer mensaje de esa sesión.

---

Eres el Claude de **despliegue a producción** del sistema de afiliación de
socios del Club Social y Deportivo de Oficiales de la FAE — Club La Campiña.
Trabajas en el servidor Ubuntu interno del Club, el mismo que sirve GLPI. El
sistema vive en `/opt/campina-socios` (contenedor `campina-socios`) con sus
datos en `/srv/campina`.

Gracias por la corrección del D-C y por el sitio de Apache: los traje tal cual
(`cherry-pick` de `dc31657`) y construí encima. Esta ronda es **corta**, pero
toca `src/domain/`, `server/` y `web/`: **hay que reconstruir la imagen**.

## Reglas de esta sesión

1. **Respalda antes de reconstruir.**
2. **SAFI:** esta ronda no necesita consultarlo. No escribas en el CRM.
3. **GLPI no se toca**, ni el sitio de Apache que ya dejaste.
4. **La base no se vacía**: siguen los trámites de prueba del Coordinador.
5. Informa en español, en lenguaje llano.

---

## Lo que cambió

Atendí su encargo punto por punto; el detalle está en la nota «Atendido» de
`PROMPT-CLAUDE-DESARROLLO.md`. Lo que le afecta a usted:

| Dónde | Qué | ¿Reconstruir? |
| --- | --- | --- |
| `src/features/afiliacion/PasoTipo.tsx` y la revisión | El abuelo del D-C en la tableta: tarjeta propia, no obligatoria, consultada en SAFI con `REGLA_OFICIAL` | No (tableta) |
| `src/domain/sociosSafi.ts` | `convencionalDesdeSafi` devuelve vacío lo que no pasa la validación —los de 7 dígitos—, y completa con el cero los de 8 que empiezan por 2–7. `celularDesdeSafi`, igual, y toma el primero de « / » | **Sí** (dominio) |
| `server/src/safi/referencias.ts` | El aviso de estado distinto de «Activo» dice ahora que **no impide** crear la ficha | **Sí** |
| `web/index.html` | Panel de SAFI: la **«Observación Control de Socios»** estaba dentro del recuadro de cuotas, que se oculta en el cónyuge, los padres y el juvenil —no se les podía escribir—; va en su propio recuadro, igual que su campo del abuelo («Parentesco del D-C»). Y ese campo lleva `type="text"`: sin él no tomaba el estilo de los demás | **Sí** |
| `server/README.md`, sección 3.6 | Reescrita: la bandeja se publica en `afiliaciones.clublacampina.com.ec` con su sitio de Apache; el 8080 sigue mientras dure el cambio. Revísela: la escribí con lo que contó en su nota | No |
| `app/configuracion.tsx`, `PROCESO-AFILIACION.md` | La dirección de ejemplo es la nueva, sin puerto; la guía suma el abuelo del D-C y dos puntos a la lista de comprobación | No |

`bandeja.js` no cambió: su código busca los elementos por `id`, y los `id`
siguen siendo los mismos.

**Probado:** el banco de siempre en `MANUAL`, con **66 comprobaciones** de la
ronda —11 nuevas: el abuelo en la tableta, en el PGS1-11 y en el Parentesco, y
su panel del D-C con el abuelo de la tableta, sin él (409) y escrito en el
panel (200)— y las **69 anteriores**, todo en verde. El panel de SAFI se revisó
en imagen con los recuadros nuevos.

## Tarea 1 — Revisar, actualizar y reconstruir

```bash
cd /opt/campina-socios
sudo git fetch origin
sudo git status
sudo git pull origin despliegue-servidor
sudo git diff --stat ORIG_HEAD HEAD -- server web src/domain src/services/formularios
```

Debe mostrar `server/README.md`, `server/src/safi/referencias.ts`,
`src/domain/sociosSafi.ts` y `web/index.html`. Respalda y reconstruye como de
costumbre.

## Tarea 2 — Comprobar en la bandeja

1. Panel de SAFI de un **cónyuge, unos padres o un juvenil** (uno de prueba, o
   uno nuevo con la tableta del Coordinador): se ve y se puede escribir la
   «Observación Control de Socios».
2. Panel de un **D-C**: el recuadro «Parentesco del D-C», con el campo del
   abuelo del mismo tamaño que los demás.
3. **No crees nada en SAFI** para probarlo: basta abrir el panel y cancelar.

## Tarea 3 — El 8080, cuando toque

Nada que hacer todavía. Cuando el Coordinador confirme que creó el registro en
su DNS y cambió la dirección en la tableta y en los tres navegadores, cierra el
8080 como dejaste dicho: `BIND_HOST=127.0.0.1` **y** `TRUST_PROXY=true`, a la
vez. Después, cambia en `server/README.md` (3.6) y en `PROCESO-AFILIACION.md`
la frase que dice que el 8080 sigue abierto.

---

## Lo que queda pendiente y no es de esta ronda

- **La tableta nueva** la compila e instala el Coordinador.
- **Completar con `02` los convencionales de 7 dígitos**: lo decide el
  Coordinador. Hoy se dejan vacíos.
- **TLS:** cuando se decida, tu nota sobre el reto DNS-01 en la zona pública.
- `CORRESPONSAL A` en `cf_917`, la lista de documentos por tipo de socio y la
  firma One Shot, como estaban.

## Lo que debes entregar al final

Un informe corto, en español: tu revisión, el respaldo y la reconstrucción, y lo
que viste en los dos paneles.
