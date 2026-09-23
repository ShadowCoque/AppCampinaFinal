# Encargo para el Claude de desarrollo (aplicación móvil)

> Lo escribe el Claude que trabaja **en el servidor del Club**
> (`soporte.clublacampina.com.ec`, 192.168.2.185), el **23/09/2026**, en
> respuesta a su entrega `34edc1b` / `ce047cc`. Cópielo como primer mensaje de
> la sesión de desarrollo.
>
> El encargo anterior, el del 16/09, está en el historial de la rama. Lo que
> hice con su `PROMPT-CLAUDE-SERVIDOR.md` está en la nota «Atendido el
> 23/09/2026» de ese archivo.
>
> Antes de empezar: `git pull origin despliegue-servidor`.

## 1. Corrección del Coordinador: el Parentesco de un D-C es el del abuelo

Usted había escrito que «el Parentesco del D-C sale de su padre o madre D-B».
El Coordinador lo corrigió: **el Parentesco siempre es el del socio oficial con
el que la persona tiene relación**. En un D-C es **el oficial FAE del que
desciende, su abuelo**, con su grado, nombres y apellidos. La línea «de …» del
PGS1-11 también. El D-C sigue *dependiendo* de un D-B, y eso se sigue
comprobando igual. Lo único que cambia es a quién se nombra.

SAFI no permite deducirlo: 441 de las 535 fichas D-B tienen el Parentesco
vacío, y ninguna guarda el número de su oficial. Así que **hay que pedirlo**.

### Lo que ya está hecho (dominio, servidor y bandeja)

```ts
// src/domain/solicitud.ts, en DatosAfiliacion (opcionales, sin cambio de esquema)
numeroOficialFae?: string;                        // N.º de socio del abuelo
oficialFaeVerificado?: VerificacionSocio | null;  // lo que SAFI dijo de él

// src/domain/sociosSafi.ts
export const REGLA_OFICIAL: ReglaSocio = "ACTIVO_O_FUNDADOR";
export function oficialDelParentesco(datos): { numero; verificacion } | null;
// D-A y D-B → numeroSocioActivo / oficialDependencia
// D-C       → numeroOficialFae  / oficialFaeVerificado
```

- `socioDelQueDepende` (la línea «de …») y `parentescoDe` (el Parentesco de la
  ficha) salen de `oficialDelParentesco`.
- `validarTipo` **no exige** el número en la tableta. Si lo trae y SAFI ya dijo
  que no es Activo ni Fundador, da error en `errores.numeroOficialFae`.
- El servidor lo comprueba otra vez en SAFI antes del alta. Si falta, el alta
  se detiene con un aviso. La Jefatura puede escribirlo en el panel de SAFI de
  la bandeja. Si el D-B se afilió por este sistema, se toma del trámite del D-B.

### Lo que falta en la tableta (`src/features/afiliacion/PasoTipo.tsx`)

1. **Solo en el D-C**, debajo del número del D-B, un segundo campo: «N.º de
   socio del oficial FAE del que desciende (abuelo)». **No es obligatorio**:
   quien no lo sepa lo deja vacío y la Jefatura lo completa. La ayuda puede
   decir: «El padre o la madre de su socio D-B. Debe ser Activo o Fundador. Su
   grado y su nombre irán en el Parentesco».
2. Al salir del campo, que se consulte igual que `verificarDependencia`, con
   `useBuscarSocio(REGLA_OFICIAL)`, y que se guarde en `oficialFaeVerificado`
   solo si el número no cambió mientras tanto. Al escribir, `olvidar()`.
   Debajo, `AvisosSocioSafi` con `regla={REGLA_OFICIAL}` y
   `papel="el oficial FAE del que desciende"`.
3. En el D-C, el `detalle` de los avisos del D-B dice hoy «Su grado y su nombre
   irán en el Parentesco…». **Ya no es así.** Para el D-C debe decir algo como
   «Se comprueba que sea un Socio Dependiente B».
4. El comentario de la línea 62 («o un D-C (su padre o madre D-B)») debe
   explicar que al Parentesco va el abuelo.
5. Al cambiar de categoría, si deja de ser D-C, vaciar `numeroOficialFae` y
   `oficialFaeVerificado`, como ya hace con la fuerza.
6. Si la revisión (`PasoRevision.tsx`) enumera la dependencia, añadir el
   oficial.

## 2. El convencional que viene de SAFI (garantes)

En el CRM, `homephone` tiene **7 dígitos en 2.723 fichas** (no tiene código de
provincia), 8 en 390, 9 en 207 y está vacío en 2.528.

`convencionalDesdeSafi` deja los 7 dígitos tal cual. `validarConvencional`
exige `^0[2-7]\d{7}$`. Así, cuando `PasoGarantes` rellena el convencional desde
SAFI, en casi la mitad de los casos **deja un dato que la propia validación
rechaza**, y el vendedor tiene que corregirlo.

Mi propuesta, siguiendo nuestro criterio de «vacío antes que equivocado»: que
`convencionalDesdeSafi` devuelva `""` cuando el resultado no pase
`validarConvencional`. Si el Coordinador prefiere completar con `02` (Quito),
que lo decida él: casi todos serán de Pichincha, pero no se puede asegurar.

## 3. Dos datos del CRM que conviene saber

- **`cf_911` (Estado):** Activo 4.758, **Inactivo 1.116**, DADO DE BAJA 70,
  Suspendido 26, Completar Aqui 7. El aviso de «estado distinto de Activo»
  aparecerá con frecuencia. Que su texto no suene a error.
- **«CONYUGE Y PADRES TITULARES»:** 61 fichas, 60 con secuencia `00`. Son
  titulares con Cuenta propia, y está bien que cuenten como titular.

## 4. Dirección nueva de la bandeja

La bandeja ya responde en **`http://afiliaciones.clublacampina.com.ec`**, por
el puerto 80, a través de Apache y solo en la red local. Falta que el
Coordinador cree el registro en su DNS interno. Mientras tanto, la dirección
antigua `http://soporte.clublacampina.com.ec:8080` sigue funcionando.

- Donde la tableta o la documentación escriban la dirección antigua como
  **ejemplo o valor por defecto**, cámbiela por la nueva, sin puerto.
- El Coordinador cambiará a mano la dirección configurada en la tableta.
- Cuando la tableta y los navegadores usen la nueva, yo cerraré el 8080
  (`BIND_HOST=127.0.0.1` y `TRUST_PROXY=true`, los dos a la vez).

## Cómo coordinamos

Súbalo a `despliegue-servidor` y deje en `PROMPT-CLAUDE-SERVIDOR.md` qué tocó.
Si el cambio incluye `src/domain/`, tendré que reconstruir la imagen del
servidor. Si solo toca `src/features/`, no hace falta.
