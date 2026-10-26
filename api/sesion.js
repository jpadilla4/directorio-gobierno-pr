import { passwordMatches, sessionCookie, clearCookie, isAdmin } from "../lib/auth.js";
import { send, fail, readJson, sameOrigin } from "../lib/http.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// GET: ¿hay sesión?  POST: entrar con contraseña.  DELETE: salir.
export default async function handler(req, res) {
  try {
    if (req.method === "GET") return send(res, 200, { admin: isAdmin(req) });
    if (!sameOrigin(req)) return fail(res, 403, "Petición rechazada.");

    if (req.method === "POST") {
      const { password } = await readJson(req, 2000);
      if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
        return fail(res, 503, "El panel todavía no tiene contraseña configurada.");
      }
      if (typeof password !== "string" || !passwordMatches(password)) {
        await wait(800); // frena intentos repetidos
        return fail(res, 401, "La contraseña no es correcta.");
      }
      return send(res, 200, { admin: true }, { "Set-Cookie": sessionCookie() });
    }
    if (req.method === "DELETE") return send(res, 200, { admin: false }, { "Set-Cookie": clearCookie() });

    res.setHeader("Allow", "GET, POST, DELETE");
    return fail(res, 405, "Método no permitido.");
  } catch (e) {
    if (e.status) return fail(res, e.status, "La petición no es válida.");
    console.error(e);
    return fail(res, 500, "No se pudo completar. Intenta de nuevo.");
  }
}
