# KanjiBE — Estado de implementación y plan de deploy

Documento de referencia del backend del Interactive Reader Engine (historias y letras). El contrato de datos y la sintaxis de furigana están en [`spec.md`](./spec.md).

Fecha de este snapshot: 14 de agosto de 2026.

---

## 1. Qué hay hoy

KanjiBE es un API REST en Node.js 20 + TypeScript + Express 5. Guarda contenido en bloques (texto tokenizado, headers, imágenes) y lo sirve al cliente iOS. El alineado de furigana **no** corre en el servidor: el API persiste el markdown `[Surface](furigana:…)` y el cliente lo interpreta.

| Área | Estado |
| --- | --- |
| Endpoints públicos de stories/lyrics | Hecho |
| CRUD admin + upload de imágenes | Hecho |
| Auth admin por API key | Hecho |
| Validación de bloques | Hecho |
| SQLite + migraciones Prisma | Hecho |
| Seed con los ejemplos del spec | Hecho |
| Tests de API | Hecho |
| Docker / Compose | Hecho |
| Panel web CRUD | Hecho en `/admin` |
| Cliente iOS | Fuera de este repo |
| Postgres / object storage | Pendiente, para cuando el hosting no tenga disco persistente |

---

## 2. Cómo está armado

```
iOS / panel admin
        │
        ▼
   Express (src/app.ts)
        │
        ├── GET /  → /admin/
        ├── GET /health
        ├── /admin            panel CRUD
        ├── /api/stories      público
        ├── /api/lyrics       público
        ├── /api/admin/*      API key
        └── /uploads          estático
                │
                ├── Prisma → SQLite (data/kanji.db)
                └── disco local (uploads/)
```

### 2.1 Stack

- **Runtime:** Node 20.19+ (`.nvmrc`)
- **HTTP:** Express 5, `helmet`, `cors`
- **Validación:** Zod
- **DB:** Prisma 5 + SQLite
- **Uploads:** Multer, jpg/png/webp/gif, máximo 8 MB
- **Tests:** Vitest + Supertest

### 2.2 Layout

| Ruta | Rol |
| --- | --- |
| `src/index.ts` | Arranque, crea dirs, escucha `PORT` |
| `src/app.ts` | App Express (también la usan los tests) |
| `src/config.ts` | Env: `DATABASE_URL`, `ADMIN_API_KEY`, `PUBLIC_BASE_URL`, `CORS_ORIGIN`, `UPLOAD_DIR` |
| `src/routes/stories.ts` | Listado paginado + detalle |
| `src/routes/lyrics.ts` | Igual, sin filtro de nivel |
| `src/routes/admin.ts` | POST/PUT/DELETE de stories y lyrics |
| `src/routes/upload.ts` | `POST /api/admin/upload` |
| `src/validators.ts` | Schemas de bloques y payloads |
| `src/lib/serialize.ts` | Blocks JSON ↔ string (SQLite no usa tipo Json de Prisma) |
| `prisma/schema.prisma` | Modelos `Story` y `Lyric` |
| `prisma/seed.ts` | `story-123` (N3) y `song-456` (Brave Heart) |
| `tests/api.test.ts` | Contrato público, admin, validación, upload |

### 2.3 Modelo de datos

Dos tablas planas. Los bloques van en una columna `blocks` (texto JSON) para preservar el orden del array del spec.

**Story:** `id`, `title`, `level`, `translation`, `coverUrl`, `blocks`, `createdAt`, `updatedAt`

**Lyric:** `id`, `title`, `artist`, `translation`, `coverUrl`, `blocks`, `createdAt`, `updatedAt`

Cada bloque:

| Campo | Regla |
| --- | --- |
| `id` | Opcional en el POST; si no viene, el server genera UUID |
| `type` | `text` \| `image` \| `header` |
| `content` | Obligatorio en `text` y `header` |
| `url` | Obligatorio en `image` |
| `translation`, `caption` | Opcionales |

Un PUT sin `blocks` deja los bloques como están. Si manda `blocks`, reemplaza el array completo.

### 2.4 API

Público (sin auth):

- `GET /api/stories?page=1&limit=20&level=N3` — sin `blocks`
- `GET /api/stories/:id` — objeto completo
- `GET /api/lyrics?page=1&limit=20` — sin `blocks`
- `GET /api/lyrics/:id` — objeto completo
- `GET /health` → `{ "ok": true }`

Admin (header `X-Admin-Key` o `Authorization: Bearer`):

- `POST /api/admin/stories` / `lyrics`
- `PUT /api/admin/stories/:id` / `lyrics/:id`
- `DELETE /api/admin/stories/:id` / `lyrics/:id`
- `POST /api/admin/upload` — campo `file` o `image` → `{ "url": "<PUBLIC_BASE_URL>/uploads/<uuid>.ext" }`

Paginación: `page` default 1, `limit` default 20, máximo 100. El filtro `level` es match exacto (`N3`, `N5`, …).

Errores habituales: `400` validación, `401` sin key, `404` recurso, `409` id duplicado.

### 2.5 Decisiones que importan para deploy

1. **SQLite en disco.** Sirve para un solo proceso con volumen persistente. No para varios replicas ni para filesystems efímeros.
2. **Imágenes en `UPLOAD_DIR`.** Mismo límite: se pierden si el host borra el disco.
3. **Una sola API key.** Suficiente para un panel interno. No hay usuarios ni JWT.
4. **Furigana opaco.** Cambiar el parser en iOS no exige migrar el API.
5. **Prisma 5, no 7.** Evita el adapter extra de Prisma 7 y corre en Node 20.

---

### 2.6 Panel admin (`/admin`)

SPA estática en `public/admin`, servida por Express. Login con `ADMIN_API_KEY` (se guarda en `sessionStorage`). Desde ahí se listan, crean, editan y borran historias y letras, se reordenan bloques, se suben imágenes y hay preview de furigana.

`GET /api/admin/session` valida la key. Las escrituras siguen yendo a los mismos endpoints admin.

## 3. Qué no está (y no hace falta para el primer deploy)

- Auth de usuarios finales / cuentas iOS
- Rate limiting, logs estructurados, métricas
- CDN / S3
- Postgres (el schema se puede cambiar cuando haga falta)
- HTTPS en la app (lo pone el reverse proxy o la plataforma)

---

## 4. Plan de deploy

Objetivo: un origen HTTPS estable para el cliente iOS, con persistencia de DB e imágenes, y la admin key fuera del repo.

### Fase 0 — Local (ya)

```bash
nvm use
cp .env.example .env          # poner un ADMIN_API_KEY propio
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Comprobar: `GET /health`, `GET /api/stories`, `GET /api/stories/story-123`.

Docker local, mismo contrato:

```bash
docker compose up --build
```

Compose monta volúmenes para `/app/data` y `/app/uploads`.

### Fase 1 — Railway

Prisma ya no lee `DATABASE_URL` en el schema (queda `file:./data/kanji.db`). El build no puede volver a fallar por una env que Railway no inyecta. En runtime, `PrismaClient` sigue pudiendo usar `DATABASE_URL` si la pones.

El crash de las 15:45 (OpenSSL 1.1 + `env("DATABASE_URL")`) es de **Nixpacks/Railpack**, no del Dockerfile. En Settings → Build confirma **Dockerfile**, rama **`main`**, y abre el deploy nuevo (otro timestamp). No hace falta `git pull` en Railway.

Después de pushear este cambio:

1. En el servicio KanjiBE → **Variables**, añade:

   | Variable | Valor |
   | --- | --- |
   | `ADMIN_API_KEY` | secreto largo (la key del panel `/admin`) |
   | `PUBLIC_BASE_URL` | `https://<tu-servicio>.up.railway.app` (sin slash final) |
   | `DATABASE_URL` | `file:./data/kanji.db` |
   | `UPLOAD_DIR` | `/app/data/uploads` |
   | `NODE_ENV` | `production` |

   No pongas `PORT`. Railway lo define y la app lo lee.

2. **Settings → Networking → Generate domain.** Si dice *Unexposed service*, no hay URL pública.

3. **Volumes:** monta un volume en `/app/data`. Sin eso, SQLite y las imágenes se borran en cada deploy. Replica = 1.

4. Redeploy. Health check: `GET /health`. Panel: `https://<dominio>/admin/`.

El warning de OpenSSL 1.1 en Alpine se evita con la image `node:20-bookworm-slim`.

### Fase 1b — Otro host con disco

Elegir un host **con disco persistente** y un solo proceso:

- VPS barato (Hetzner, DigitalOcean, Fly con volume)
- Railway / Render **solo si** hay volume, no el plan efímero

Pasos:

1. Subir el repo (o el image de `Dockerfile`).
2. Variables:

   | Variable | Valor |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `PORT` | el que asigne el host, o `3000` |
   | `DATABASE_URL` | `file:./data/kanji.db` |
   | `ADMIN_API_KEY` | secreto largo, no el de desarrollo |
   | `PUBLIC_BASE_URL` | `https://api.tudominio.com` (sin slash final) |
   | `CORS_ORIGIN` | `*` está bien para la app nativa; restringir si hay panel web |
   | `UPLOAD_DIR` | ruta dentro del volume |

3. El `CMD` del Docker ya corre `prisma migrate deploy` y luego `node dist/index.js`.
4. Health check del host: `GET /health`.
5. Sembrar contenido una vez: `npm run db:seed` contra esa DB, o cargar por admin.
6. En iOS, apuntar el base URL a `PUBLIC_BASE_URL`.

Criterio de “ya está en prod”: health 200, listados con seed, upload visible en `/uploads/…`, y un POST admin sin key da 401.

### Fase 2 — Si el host no guarda disco (Render/Railway free, varios dynos)

SQLite y `uploads/` no sirven. Cambiar a:

1. **Postgres** administrado de la misma plataforma.
2. En `prisma/schema.prisma`: `provider = "postgresql"`.
3. Nueva migración (no reutilizar la SQL de SQLite).
4. `DATABASE_URL` = URL de Postgres.
5. Imágenes a un bucket (Cloudflare R2, S3, o el storage del host). `POST /api/admin/upload` debería devolver la URL pública del bucket en vez de `/uploads/…`.

Hasta que eso no esté, no escalar a más de una instancia.

### Fase 3 — Después del primer contenido real

Solo cuando haga falta, no bloquean el primer deploy:

- Dominio + HTTPS (Caddy/nginx o el proxy de la plataforma)
- Pulir el panel si hace falta (búsqueda, paginación larga)
- Rotación de `ADMIN_API_KEY`
- Backup del `.db` o de Postgres (diario alcanza al inicio)
- Mover covers/imágenes a CDN si el peso empieza a importar

---

## 5. Checklist de un deploy concreto

- [ ] Node 20 o image `node:20-bookworm-slim`
- [ ] `ADMIN_API_KEY` de producción, no commiteada
- [ ] `PUBLIC_BASE_URL` = URL pública real
- [ ] Volume (o Postgres + bucket si no hay disco)
- [ ] `prisma migrate deploy` en el arranque (ya está en el Dockerfile)
- [ ] Health check en `/health`
- [ ] Probar `GET /api/stories` y `GET /api/lyrics/:id` desde fuera
- [ ] Probar upload y abrir la URL que devuelve
- [ ] Actualizar el base URL del cliente iOS

---

## 6. Riesgos a no olvidar

- **Disco efímero:** se pierde la DB y las imágenes en el siguiente deploy.
- **Varias réplicas + SQLite:** escrituras corruptas. Un solo proceso, o pasar a Postgres.
- **`PUBLIC_BASE_URL` mal puesto:** el iOS recibe URLs de `localhost` y las portadas no cargan.
- **API key en el cliente iOS:** no va ahí. Solo panel/admin o un backend interno.
- **Seed en producción más de una vez:** el seed hace upsert de `story-123` y `song-456`; no pisa cambios si ya existen, pero tampoco los actualiza.

---

## 7. Siguiente trabajo sugerido

1. Elegir host de Fase 1 y pegar el base URL en iOS.
2. Cargar contenido desde `/admin` y apuntar el iOS al base URL.
3. Dejar Fase 2 (Postgres + bucket) anotada para cuando el hosting o el tráfico lo pidan.
