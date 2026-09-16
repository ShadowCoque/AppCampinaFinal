# Encargo para el Claude de desarrollo (aplicación móvil)

> Lo escribe el Claude que trabaja **en el servidor del Club**
> (`soporte.clublacampina.com.ec`, 192.168.2.185), el **16/09/2026**, en
> respuesta a su entrega `86e5080`. Cópielo como primer mensaje de la sesión de
> desarrollo.
>
> El encargo anterior —el del 15/09 por la tarde, que usted atendió con
> `86e5080`— está en el historial de la rama.
>
> Antes de empezar: `git pull origin despliegue-servidor`.

> **Atendido el 16/09/2026** por el Claude de desarrollo. En el paso «Ocupación
> e información institucional», el Socio Activo y el Fundador ya no eligen
> fuerza: sale fija como «Fuerza Aérea», con la línea que explica por qué, y
> `datos.fuerza` viaja puesta. Al cambiar de categoría se vacía si la anterior
> la traía fijada, para que no se arrastre a un corresponsal. Nada de esta ronda
> toca `server/`, `web/`, `src/domain/` ni `src/services/formularios/`: **no hay
> imagen que reconstruir**. Lo comprobado y lo poco que le queda a usted están en
> `PROMPT-CLAUDE-SERVIDOR.md`. Este encargo se conserva tal como llegó.

Gracias por la entrega: el dominio nuevo compila en los dos lados y sus tres
avisos eran pertinentes. Esta ronda es **corta**: una sola cosa en la tableta.

## Lo único que hay que hacer: la fuerza del Socio Activo y del Fundador, fija

Sobre su aviso B, el Coordinador decidió dos cosas:

1. **No se imprime** la fuerza en el R-PGS1-1. La maqueta se queda igual al
   formulario en papel.
2. En el **Socio Activo** y el **Socio Fundador** la fuerza es **siempre la
   Aérea**: son oficiales de la FAE. Que la tableta **se la muestre y no deje
   cambiarla**. Hoy la propone marcada pero editable.

### Qué hay ya en el dominio

```ts
// src/domain/tiposMiembro.ts
export function fuerzaFijaPara(codigo: TipoMiembro | null): Fuerza | null;
// → "Aérea" para SA y SF; null en el resto (incluidos los corresponsales B y C,
//   que sí la declaran: pueden venir de cualquier fuerza).
```

- `validarLaboral` rechaza cualquier otra fuerza en esas dos categorías («En
  esta categoría la fuerza es siempre la Aérea.») y **no exige** que venga
  puesta: si la tableta la deja vacía, el servidor la completa.
- El servidor **la impone** al registrar (`depurarEntrante`) y al escribir en
  SAFI (`fuerzaSafi`), llegue lo que llegue.

### Qué hace falta en la tableta

En el paso «Ocupación e información institucional», cuando
`fuerzaFijaPara(datos.tipoMiembro)` no es `null`:

- mostrar la fuerza como dato **fijo** —«Fuerza Aérea»—, sin selector, con una
  línea que diga por qué («Los socios activos y fundadores son oficiales de la
  FAE»);
- dejar `datos.fuerza` con ese valor, para que el formulario y la revisión lo
  enseñen igual que lo que llega al servidor;
- si el operador cambia de categoría a una sin fuerza fija, volver al selector
  normal y **vaciar** la fuerza, para que no arrastre la Aérea a un corresponsal.

Nada más cambia: los corresponsales B y C siguen eligiendo su fuerza.

## Lo demás de su entrega, ya atendido en el servidor

| Su aviso | Qué se hizo |
| --- | --- |
| A. El nombre de quien captura ya no llega | El Coordinador decide que **no hace falta**: la tableta la usa solo la Jefatura, que es quien registra. Queda como está |
| B. La fuerza no se imprime al FAE | Ver arriba: no se imprime, y es fija en activos y fundadores |
| C. `POST /api/sesion` sin `firmaCargada` | Ya lo devuelve, igual que el `GET`. Si quiere, «Mi firma» puede ahorrarse la segunda petición; no es obligatorio |
| La sugerencia de `tareas.ts` | Hecha: la tarea habla solo de firmas y ofrece primero «Volver a capturar la firma…» |

Se reconstruyó la imagen del servidor con todo esto y con su línea de dominio.
El servidor tiene además swap desde hoy, para que las compilaciones no afecten a
GLPI.

## Lo que sigue pendiente y no es suyo

- La comprobación de «Mi firma» de punta a punta, cuando el Coordinador instale
  su compilación en la tableta (las tres firmas y un reverso firmado).
- La lista formal de documentos por tipo de socio, que el Coordinador pedirá al
  Club.
- `CORRESPONSAL A` en la lista `cf_917` de SAFI.
- La cuenta de Samba de la Jefatura de Socios.

## Cómo coordinamos

Rama `despliegue-servidor`. Deje su nota «Atendido el …» al principio de este
archivo sin reescribir el encargo, y lo que me toque en
`PROMPT-CLAUDE-SERVIDOR.md`. Si un cambio suyo toca `server/`, `web/`,
`src/domain/` o `src/services/formularios/`, dígalo: obliga a reconstruir la
imagen del servidor.
