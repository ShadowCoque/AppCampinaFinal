import type { FastifyReply, FastifyRequest } from "fastify";

import type { Area } from "../../../src/domain/solicitud";
import { config } from "../config";
import { usuarioDeSesion, type Usuario } from "../db/usuarios";

/**
 * Sesión de la bandeja de tareas.
 *
 * La cookie viaja firmada por Fastify (`@fastify/cookie` con `signed: true`) y
 * solo contiene el identificador de una sesión almacenada en la base: el
 * servidor puede revocarla en cualquier momento y la cookie por sí sola no
 * acredita nada.
 */

export const COOKIE_SESION = "campina_sesion";

export const OPCIONES_COOKIE = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  // Se marca `secure` solo cuando `URL_PUBLICA` es `https://`. Un servidor
  // interno sin certificado (por ejemplo, publicado como HTTP plano junto al
  // GLPI del Club) también corre en modo producción, y una cookie `Secure` ahí
  // haría que el navegador la descartara sin avisar: el inicio de sesión
  // parecería fallar sin motivo.
  secure: config.usaTls,
  signed: true,
  maxAge: config.horasSesion * 3600,
};

declare module "fastify" {
  interface FastifyRequest {
    usuario?: Usuario;
  }
}

/** Recupera el usuario de la petición, o `null` si no hay sesión válida. */
export function usuarioDe(peticion: FastifyRequest): Usuario | null {
  const bruta = peticion.cookies[COOKIE_SESION];
  if (!bruta) return null;

  const verificada = peticion.unsignCookie(bruta);
  if (!verificada.valid || !verificada.value) return null;

  return usuarioDeSesion(verificada.value);
}

/** Exige sesión iniciada. Responde 401 y devuelve `null` si no la hay. */
export function exigirSesion(peticion: FastifyRequest, respuesta: FastifyReply): Usuario | null {
  const usuario = usuarioDe(peticion);
  if (!usuario) {
    void respuesta.code(401).send({ error: "Debe iniciar sesión." });
    return null;
  }
  peticion.usuario = usuario;
  return usuario;
}

/** Exige sesión iniciada y que el usuario pertenezca a una de las áreas dadas. */
export function exigirArea(
  peticion: FastifyRequest,
  respuesta: FastifyReply,
  ...areas: Area[]
): Usuario | null {
  const usuario = exigirSesion(peticion, respuesta);
  if (!usuario) return null;

  if (!areas.includes(usuario.area)) {
    void respuesta.code(403).send({
      error: `Esta acción corresponde a: ${areas.join(", ")}. Su usuario pertenece a ${usuario.area}.`,
    });
    return null;
  }

  return usuario;
}
