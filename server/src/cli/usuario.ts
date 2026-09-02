import crypto from "node:crypto";

import { AREAS, type Area } from "../../../src/domain/solicitud";
import { db } from "../db/indice";
import { cambiarClave, crearUsuario, listarUsuarios } from "../db/usuarios";

/**
 * Alta y mantenimiento de los usuarios de la bandeja de tareas.
 *
 *   npm run usuario -- crear socios "MARIA FERNANDA PEREZ" SOCIOS
 *   npm run usuario -- clave contabilidad
 *   npm run usuario -- listar
 *
 * Si no se indica contraseña, se genera una robusta y se imprime una sola vez:
 * así nadie tiene que inventarse una débil ni enviarla por escrito dos veces.
 */

function generarClave(): string {
  // Sin caracteres ambiguos: la contraseña se dicta o se copia a mano.
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(16))
    .map((b) => alfabeto[b % alfabeto.length])
    .join("");
}

function uso(): never {
  console.log(`Uso:
  usuario crear <usuario> "<NOMBRE COMPLETO>" <AREA> [contraseña]
  usuario clave <usuario> [contraseña]
  usuario listar

Áreas válidas: ${AREAS.join(", ")}`);
  process.exit(1);
}

function principal(): void {
  const [comando, ...argumentos] = process.argv.slice(2);
  db();

  try {
    ejecutar(comando, argumentos);
  } catch (error) {
    // Un usuario repetido o una contraseña corta son errores de uso, no fallos
    // del programa: se explican en una línea.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function ejecutar(comando: string | undefined, argumentos: string[]): void {
  switch (comando) {
    case "crear": {
      const [usuario, nombre, area, clave] = argumentos;
      if (!usuario || !nombre || !area) uso();

      if (!(AREAS as readonly string[]).includes(area)) {
        console.error(`Área no válida: ${area}. Use una de: ${AREAS.join(", ")}`);
        process.exit(1);
      }

      const definitiva = clave || generarClave();
      crearUsuario({ usuario, nombre, area: area as Area, clave: definitiva });

      console.log(`Usuario creado.
  Usuario:     ${usuario.toLowerCase()}
  Nombre:      ${nombre}
  Área:        ${area}
  Contraseña:  ${definitiva}

Entréguela por un canal seguro. No vuelve a mostrarse.`);
      break;
    }

    case "clave": {
      const [usuario, clave] = argumentos;
      if (!usuario) uso();

      const definitiva = clave || generarClave();
      if (!cambiarClave(usuario, definitiva)) {
        console.error(`No existe el usuario ${usuario}.`);
        process.exit(1);
      }

      console.log(`Contraseña actualizada.
  Usuario:     ${usuario.toLowerCase()}
  Contraseña:  ${definitiva}`);
      break;
    }

    case "listar": {
      const usuarios = listarUsuarios();
      if (usuarios.length === 0) {
        console.log("No hay usuarios dados de alta.");
        break;
      }
      console.log("USUARIO".padEnd(18) + "ÁREA".padEnd(16) + "NOMBRE");
      for (const u of usuarios) {
        console.log(
          u.usuario.padEnd(18) + u.area.padEnd(16) + u.nombre + (u.activo ? "" : "  (inactivo)")
        );
      }
      break;
    }

    default:
      uso();
  }
}

principal();
