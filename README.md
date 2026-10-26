# Directorio del Gobierno de Puerto Rico

Directorio con búsqueda de las agencias, servicios y los 78 municipios del Gobierno de Puerto Rico, en una sola página.

**Sitio:** https://directorio-pr-sitio.vercel.app

## Qué hace

- **Búsqueda instantánea** por nombre, sigla (DTOP, DACO, ASUME…), dominio o trámite ("planilla", "licencia", "luz"). No distingue acentos.
- **15 categorías** y un filtro de **regiones** (Metro, Norte, Oeste, Sur, Este, Centro) para los 78 municipios.
- **6 paletas de colores** (Bandera, Caribe, Yunque, Flamboyán, Grafito y Blanco), con modo claro y oscuro.
- **Buzón de sugerencias** para proponer enlaces, reportar enlaces rotos o comentar.
- **Panel de administración** en `/admin`, protegido con contraseña:
  - Avisos de sugerencias nuevas: contador en la campana, aviso en pantalla, título de la pestaña y notificación del navegador (opcional).
  - Marcar sugerencias como leídas, archivarlas, borrarlas o convertirlas en un enlace.
  - Agregar, editar y borrar enlaces, y crear categorías nuevas.

## Cómo está hecho

| Parte | Tecnología |
|---|---|
| Sitio público y panel | HTML, CSS y JavaScript sin frameworks |
| API | Funciones de Vercel (Node.js) en `api/` |
| Datos | Vercel Blob privado: `data/enlaces.json` y una sugerencia por archivo |
| Sesión del admin | Cookie `HttpOnly` firmada con HMAC, válida por 8 horas |
| Estadísticas | Turso (libSQL), anónimas y sin cookies |

```
index.html                    Sitio público
admin/index.html              Panel de administración
api/enlaces.js                GET público; POST/PUT/DELETE solo admin
api/sugerencias.js            POST público; GET/PATCH/DELETE solo admin
api/sesion.js                 Entrar y salir del panel
lib/                          Sesión, utilidades HTTP y almacenamiento
data/enlaces-iniciales.json   Directorio inicial (se usa hasta el primer cambio)
```

## Configuración en Vercel

Variables de entorno necesarias (nunca se guardan en el repositorio):

- `BLOB_READ_WRITE_TOKEN`: la crea Vercel al conectar el Blob store.
- `SESSION_SECRET`: texto aleatorio de 32 caracteres o más para firmar la sesión.
- `ADMIN_PASSWORD`: contraseña del panel.
- `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`: base de datos de Turso para las estadísticas. Sin ellas, el sitio funciona igual y la pestaña de estadísticas muestra un aviso.

## Estadísticas

La pestaña **Estadísticas** del panel muestra visitantes y visitas de hoy, del periodo (7, 30 o 90 días) y desde el inicio. También muestra una gráfica por día, de dónde llegan las visitas, el dispositivo, lo más buscado y las búsquedas sin resultados.

No usa cookies. Cada visitante se cuenta con un código anónimo (hash de una sal diaria + IP + navegador) que cambia cada día, y la IP no se guarda. El detalle se borra a los 90 días y se conservan los totales diarios. No se cuentan los bots ni las visitas con sesión del panel. Para saber de dónde llega la gente, comparte el enlace con `?ref=facebook`, `?ref=whatsapp`, etc.

## Publicación

Vercel está conectado a este repositorio. Cada cambio que llega a `main` se publica solo en el sitio; las demás ramas generan una vista previa.

## Desarrollo local

```bash
npm install
npx vercel env pull .env.local
npx vercel dev
```

## Aviso

Este es un proyecto independiente. No está afiliado, patrocinado ni avalado por el Gobierno de Puerto Rico ni por ninguna de sus agencias o municipios.

## Fuentes

Los enlaces de los municipios llevan a su portal oficial cuando existe uno verificado. Si no, llevan a su ficha en el [directorio de municipios de pr.gov](https://pr.gov/gobierno-2/directorio-municipios).
