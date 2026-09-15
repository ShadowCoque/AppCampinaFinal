# Retirado: la fotografía tipo carnet

> Funcionalidad que existió en el sistema de afiliación entre el 11/09/2026 y el
> **15/09/2026**, y que se retiró por decisión del Coordinador de TICs. Este
> documento deja constancia de qué hacía y de por qué puede volver a hacer falta.

## Qué hacía

La tableta tenía un paso llamado **«Fotografía del socio»**, entre «Garantes» y
«Carta de compromiso». Capturaba una fotografía tipo carnet —fondo blanco,
rostro descubierto y de frente— con la cámara o desde la galería, con recorte
cuadrado, y la enviaba al servidor como un adjunto del trámite
(`FOTO_CARNET`), igual que las firmas. Al aprobarse el ingreso, la fotografía
entraba al expediente digital con el nombre estándar del repositorio y viajaba,
con el resto del expediente, a Documentos de la Cuenta del socio en SAFI.

Era **obligatoria** en toda categoría que genera credencial, es decir, en todas.

## Por qué se retiró

1. **No funcionaba de forma fiable.** En la prueba del 15/09/2026 la tableta
   decía que no podía conectarse con el servidor únicamente al enviar la
   fotografía: la firma, por la misma conexión y la misma sesión, subía sin
   problema. En los registros del servidor no consta **ninguna** petición de
   subida de fotografía, ni siquiera rechazada, así que la entrega fallaba en el
   dispositivo antes de salir a la red.
2. **No tenía destinatario.** El Club no trabaja fotografías en SAFI (el campo
   `imagename[]` de la ficha del Socio nunca se usó) y la carnetización se sigue
   haciendo con el sistema actual, ajeno a este. Una fotografía que no alimenta
   ningún proceso es un dato personal más que custodiar sin motivo.

## Por qué puede volver

La captura fotográfica es la mitad de lo que necesitaría **CampiñaAccess**, la
idea de una aplicación móvil para socios con control de accesos y control de uso
del parqueadero. Ahí la fotografía sí tendría destinatario, junto a un registro
biométrico, y el momento natural para capturarla seguiría siendo la afiliación,
con el socio delante.

Si se retoma, conviene saber:

- El expediente digital ya sabe archivar imágenes con el nombre estándar del
  repositorio: la pieza de archivado no hay que rehacerla.
- El adjunto viajaba por `POST /api/solicitudes/:id/adjuntos` con el campo
  `rol`, el mismo camino que las firmas, que sí funciona.
- Habrá que resolver primero **por qué la tableta no lograba enviarla**, porque
  el mismo canal servía para las firmas.
- El consentimiento de la tableta ya contempla el uso de la imagen en la
  credencial (`imagenCredencial`, en el aviso de protección de datos): esa parte
  del consentimiento se conserva y no hubo que retirarla.

## Qué se quitó, exactamente

| Dónde | Qué |
| --- | --- |
| `src/domain/documentos.ts` | El tipo de documento `FOTO_CARNET`, su requisito y la función `requisitosCapturables`, que ya solo servía para la fotografía |
| `src/domain/solicitud.ts` | El rol de adjunto `FOTO_CARNET` y su presencia en `adjuntosEsperados` |
| `src/domain/formularioAfiliacion.ts` | El paso «fotografia» del asistente y su validación |
| `server/src/formularios/expediente.ts` | La copia de la fotografía al expediente al aprobarse el ingreso |
| `server/src/formularios/recursos.ts`, `src/services/formularios/tipos.ts` | El recurso `fotoCarnet` del generador de formularios |
| Aplicación de la tableta | El paso «Fotografía del socio» y la reposición de la fotografía desde la solicitud |

El reverso del formulario impreso **conserva** «Foto tamaño carnet con fondo
blanco» en la lista de requisitos para carnetización: ese requisito es del Club
y se sigue cumpliendo en papel.
