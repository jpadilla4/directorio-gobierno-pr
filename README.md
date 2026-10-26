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
