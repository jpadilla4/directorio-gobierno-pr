import { getDirectory, updateDirectory } from "../lib/store.js";
import { send, fail, readJson, requireAdmin, cleanText, cleanUrl } from "../lib/http.js";

function slug(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function validLink(body, regiones) {
  const n = cleanText(body.n, 120);
  const u = cleanUrl(body.u);
  const c = cleanText(body.c, 60);
  if (!n) return { error: "Escribe el nombre de la entidad." };
  if (!u) return { error: "El enlace debe empezar con https:// o http://." };
  if (!c) return { error: "Escoge o escribe una categoría." };
  const link = { n, s: cleanText(body.s, 12).toUpperCase(), u, c, t: cleanText(body.t, 200) };
  if (c === "Municipios") {
    if (!regiones.includes(body.r)) return { error: "Escoge la región del municipio." };
    link.r = body.r;
  }
  return { link };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { data } = await getDirectory();
      return send(res, 200, data, { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300" });
    }
    if (!requireAdmin(req, res)) return;

    if (req.method === "POST" || req.method === "PUT") {
      const body = await readJson(req);
      const { data } = await getDirectory();
      const { link, error } = validLink(body, data.regiones);
      if (error) return fail(res, 400, error);
      let savedId = body.id;
      const next = await updateDirectory((dir) => {
        if (req.method === "PUT") {
          const i = dir.enlaces.findIndex((l) => l.id === body.id);
          if (i < 0) throw Object.assign(new Error("not_found"), { status: 404 });
          dir.enlaces[i] = { id: body.id, ...link };
        } else {
          const base = slug(link.s || link.n) || "enlace";
          let id = base;
          for (let k = 2; dir.enlaces.some((l) => l.id === id); k++) id = `${base}-${k}`;
          savedId = id;
          dir.enlaces.push({ id, ...link });
        }
        if (!dir.categorias.includes(link.c)) dir.categorias.push(link.c);
        return dir;
      });
      return send(res, 200, { ok: true, id: savedId, total: next.enlaces.length });
    }

    if (req.method === "DELETE") {
      const id = String(req.query?.id || new URL(req.url, "http://x").searchParams.get("id") || "");
      const next = await updateDirectory((dir) => {
        const before = dir.enlaces.length;
        dir.enlaces = dir.enlaces.filter((l) => l.id !== id);
        if (dir.enlaces.length === before) throw Object.assign(new Error("not_found"), { status: 404 });
        return dir;
      });
      return send(res, 200, { ok: true, total: next.enlaces.length });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return fail(res, 405, "Método no permitido.");
  } catch (e) {
    if (e.status === 404) return fail(res, 404, "Ese enlace ya no existe. Recarga la lista.");
    if (e.status) return fail(res, e.status, "La petición no es válida.");
    console.error(e);
    return fail(res, 500, "No se pudo completar. Intenta de nuevo.");
  }
}
